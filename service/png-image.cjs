'use strict';
// Narrow PNG decoder/re-encoder. Never retains input metadata, executable payloads, animation or paths.
const zlib=require('node:zlib');
const SIGNATURE=Buffer.from([137,80,78,71,13,10,26,10]);
const table=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(bytes){let c=0xffffffff;for(const byte of bytes)c=table[(c^byte)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
function reject(){throw Object.assign(Error('invalid_png'),{status:400,code:'invalid_png'});}
function chunk(type,data){const name=Buffer.from(type),out=Buffer.alloc(12+data.length);out.writeUInt32BE(data.length);name.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([name,data])),8+data.length);return out;}
function encode(width,height,rgba){const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;const raw=Buffer.alloc(height*(1+width*4));for(let y=0;y<height;y++)rgba.copy(raw,y*(1+width*4)+1,y*width*4,(y+1)*width*4);return Buffer.concat([SIGNATURE,chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw,{level:6})),chunk('IEND',Buffer.alloc(0))]);}
function decode(input){
 if(!Buffer.isBuffer(input)||input.length>4*1024*1024||input.length<57||!input.subarray(0,8).equals(SIGNATURE))reject();
 let offset=8,width,height,channels,seenHeader=false,seenData=false,endedData=false,ended=false;const pieces=[];
 while(offset<input.length){
  if(offset+12>input.length)reject();const length=input.readUInt32BE(offset);if(length>4*1024*1024||offset+12+length>input.length)reject();
  const type=input.subarray(offset+4,offset+8).toString('ascii'),data=input.subarray(offset+8,offset+8+length);
  if(!/^[A-Za-z]{4}$/.test(type)||crc32(input.subarray(offset+4,offset+8+length))!==input.readUInt32BE(offset+8+length))reject();
  if(!seenHeader&&type!=='IHDR')reject();
  if(type==='IHDR'){
   if(seenHeader||length!==13)reject();seenHeader=true;width=data.readUInt32BE();height=data.readUInt32BE(4);channels={0:1,2:3,4:2,6:4}[data[9]];
   if(width<16||height<16||width>2048||height>2048||width*height>4194304||data[8]!==8||!channels||data[10]||data[11]||data[12])reject();
  }else if(type==='IDAT'){if(endedData)reject();seenData=true;pieces.push(data);}
  else if(type==='IEND'){if(length||!seenData)reject();ended=true;offset+=12;break;}
  else {if(type==='acTL'||type==='fcTL'||type==='fdAT'||type==='tRNS'||type[0]===type[0].toUpperCase())reject();if(seenData)endedData=true;}
  offset+=12+length;
 }
 if(!ended||offset!==input.length)reject();const stride=width*channels,expected=(stride+1)*height;let inflated;
 try{inflated=zlib.inflateSync(Buffer.concat(pieces),{maxOutputLength:expected});}catch{reject();}if(inflated.length!==expected)reject();
 const pixels=Buffer.alloc(width*height*channels);const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<height;y++){
  const mode=inflated[y*(stride+1)];if(mode>4)reject();
  for(let x=0;x<stride;x++){
   const i=y*stride+x,a=x>=channels?pixels[i-channels]:0,b=y?pixels[i-stride]:0,c=y&&x>=channels?pixels[i-stride-channels]:0;
   pixels[i]=(inflated[y*(stride+1)+1+x]+(mode===0?0:mode===1?a:mode===2?b:mode===3?Math.floor((a+b)/2):paeth(a,b,c)))&255;
  }
 }
 const rgba=Buffer.alloc(width*height*4);
 for(let i=0;i<width*height;i++){const p=i*channels,q=i*4;if(channels<3){rgba[q]=rgba[q+1]=rgba[q+2]=pixels[p];rgba[q+3]=channels===2?pixels[p+1]:255;}else{rgba[q]=pixels[p];rgba[q+1]=pixels[p+1];rgba[q+2]=pixels[p+2];rgba[q+3]=channels===4?pixels[p+3]:255;}}
 return{width,height,rgba};
}
function fit({width,height,rgba},size){
 const out=Buffer.alloc(size*size*4),scale=Math.min(size/width,size/height),w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale)),ox=Math.floor((size-w)/2),oy=Math.floor((size-h)/2);
 // Pixel-center bilinear interpolation in premultiplied alpha prevents dark transparent fringes.
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const sx=Math.max(0,Math.min(width-1,(x+.5)/scale-.5)),sy=Math.max(0,Math.min(height-1,(y+.5)/scale-.5)),x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(width-1,x0+1),y1=Math.min(height-1,y0+1),fx=sx-x0,fy=sy-y0;
  const samples=[[x0,y0,(1-fx)*(1-fy)],[x1,y0,fx*(1-fy)],[x0,y1,(1-fx)*fy],[x1,y1,fx*fy]],acc=[0,0,0,0];
  for(const [xx,yy,weight]of samples){const i=(yy*width+xx)*4,a=rgba[i+3]/255;acc[3]+=a*weight;for(let c=0;c<3;c++)acc[c]+=rgba[i+c]*a*weight;}
  const dest=((y+oy)*size+x+ox)*4;for(let c=0;c<3;c++)out[dest+c]=acc[3]?Math.round(acc[c]/acc[3]):0;out[dest+3]=Math.round(acc[3]*255);
 }
 return encode(size,size,out);
}
function normalizePng(input){const decoded=decode(input);return{image:fit(decoded,1024),thumbnail:fit(decoded,128),sourceWidth:decoded.width,sourceHeight:decoded.height};}
module.exports={decode,encode,normalizePng,crc32};
