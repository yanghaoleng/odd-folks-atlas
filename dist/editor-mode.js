(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EditorPreviewMode=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function clearMetadata(state){for(const k of ['descriptor','colorToken','colorHex','animalLabel','animalToken','assetStatus','previewLayerVersion'])delete state[k]}
function enterManual(state,supportedHeads){clearMetadata(state);if(!supportedHeads.includes(state.animal))state.animal=supportedHeads[0];state.mappingVersion='preview-v1';return 'preview-v1'}
return{clearMetadata,enterManual};
});
