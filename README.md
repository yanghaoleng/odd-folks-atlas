# 怪可爱图鉴 · Odd Folks Atlas

给今天的自己，挑一个怪可爱的小伙伴。

一个可以自己部署的分层头像编辑器。把动物、奇妙角色、颜色、配饰和情绪组合在一起，调整位置，试试动效，再把喜欢的头像下载下来。

**源码公开 · 仅限许可允许的非商业用途 · 自行部署**

本项目不提供官方托管服务、SDK 或对外 API 支持。页面使用的内部 HTTP 路由是编辑器自身的实现，不承诺为第三方接入保持兼容。你部署的实例、数据、安全和升级由你自己管理。

## 看看效果

以下均为本仓库实际运行的浏览器截图，不是设计稿。使用本地独立配置，无需连接作者的站点。

![怪可爱图鉴桌面编辑器：大头像预览与随机组合](docs/screenshots/editor-desktop.png)

<details>
<summary>手机效果与资源对照表</summary>

<img src="docs/screenshots/editor-mobile.png" width="390" alt="怪可爱图鉴手机编辑器">

![资源对照表：素材缩略图、名称、稳定标识和状态](docs/screenshots/catalog-desktop.png)

<img src="docs/screenshots/compact-mobile.png" width="390" alt="本页演示，不保存配置">

<img src="docs/screenshots/keypad-mobile.png" width="390" alt="带填充扩散反馈的六位数字键盘">

</details>

## 可以做什么

- **组合头像**：52 个动物与通用角色头部、22 个情绪/装饰图层、8 个配饰和 20 种颜色。素材有“已启用 / 待调位”之分，数量不代表都已完成校准。
- **调整图层**：拖动、缩放、旋转、撤销和重做；同一素材的调位应用到相关组合。
- **探索组合**：随机生成一组头像、预览种子和中文名称、下载 PNG。
- **让头像动起来**：配置入场、点击、情绪强调与背景动效；尊重浏览器的减少动态效果设置。
- **整理素材**：资源对照表、颜色和名称、组合规则、受校验的 PNG 上传。上传先进入待校准状态，不会自动加入可用组合。
- **紧凑编辑面板**：图层和常用选项直接点选，动画在主头像中预览。手机面板滚动到边缘后继续滑动可收起；关闭按钮与 Escape 同样可用，数字参数保留在更多设置中。
- **放心试一试**：打开自己实例的 `/?demo=1`，复制当前公开配置到本页内存。调位、名称、配色和规则修改都不上传、不保存，刷新或离开即丢弃。配置了登录的实例会在服务器确认六位密码不匹配后进入此演示；正确密码仍正常登录，限速锁定与网络故障不会被当成成功。
- **一个小彩蛋**：左上角头像每次访问随机，点击或按 Enter / Space 换一个小伙伴并播放入场效果。favicon 跟随生成静态 PNG，不逐帧刷新。不同浏览器对标签栏图标更新的时机可能不同。

页面里的种子和生成标识只用于头像预览，不是账号 UID 分配系统。项目不包含第三方业务账号、用户身份库或身份迁移工具。

## 三步在本机运行

需要 **Node.js 22 或更新版本**。无需安装运行时 npm 依赖，也没有构建步骤。

```sh
git clone https://github.com/yanghaoleng/odd-folks-atlas.git
cd odd-folks-atlas
npm run dev
```

打开 **http://127.0.0.1:4180**。请使用这个精确地址，开发模式不接受其他 Host。

`npm run dev` 明确启用仅限本机的无密码编辑，修改会保存到自己的 `data/`。这与 `/?demo=1` 的不保存演示是两种不同模式。不要通过隧道、反向代理或端口转发把开发模式暴露出去。

## 部署自己的实例

```sh
npm start
```

默认仅在本机地址监听，**没有配置管理权限时保持只读**。只读模式仍可浏览、预览和下载。

需要远程编辑时，请按 [自部署说明](docs/SELF_HOST.md) 配置自己的 HTTPS、管理员登录和持久化目录。设置最底部提供退出登录或退出演示，方便切换模式。仓库不附默认密码，也不会读取或调用作者的部署。

请备份自己的数据；一个数据目录只运行一个服务进程。不要把 `data/`、认证文件、上传数据或备份提交到 Git，也不要把项目根目录作为公开静态目录。

## 开发与结构

```sh
npm test
```

- `dist/`：可直接运行的浏览器源码、样式、字体与素材。
- `service/`：Node.js 标准库服务，负责本实例配置、素材定义、上传校验和持久化。
- `tests/`：独立临时数据与 loopback 测试。
- `docs/SELF_HOST.md`：运行、安全配置及恢复说明。
- `docs/asset-inventory.json`：发布素材的路径、SHA-256 与许可分类。

这个独立发行版使用自己的素材清单，不能直接覆盖其他站点的数据目录。修改清单后应维护版本和对应校验，不要拿不兼容的数据强行启动。

## 使用许可

- **代码与技术文档**：[PolyForm Noncommercial 1.0.0](LICENSE)。允许目的及例外以完整许可证为准。
- **项目美术与截图**：[CC BY-NC 4.0](ASSET_LICENSE.md)，在许可人有权授予的范围内允许署名、非商业分享和改编。
- **第三方字体、图标和音效**：保留原来的 OFL、MIT、CC0 许可，见 [第三方声明](THIRD_PARTY_NOTICES.md)。

这是 **source-available（源码公开）** 项目，不是 OSI 定义的开源项目。企业内部使用、免费提供或不直接收费并不自动属于非商业用途；代码许可中明确列出的允许目的和组织例外仍按原文适用，美术许可另行判断。公开仓库不等于允许商业使用，非商业许可也不等于获得了第三方角色或商标授权。本公开包不包含已知第三方角色素材。

美术使用 AI 辅助创作；许可仅覆盖可以授予的权利，不保证生成素材在所有地区都具有排他版权。你上传或替换的素材由你负责取得相应授权。

软件按现状提供，不作可用性或适用性担保。

---

**English** · Odd Folks Atlas is a self-hosted layered avatar editor with editable transforms, random combinations, Chinese display names, PNG export and motion previews. Node.js 22+, no runtime package installation or build step. Run `npm run dev` for explicit loopback-only editing; `npm start` is read-only unless you configure your own administration. There is no official hosted service, supported SDK or public API. Code is PolyForm Noncommercial 1.0.0; project artwork is CC BY-NC 4.0 to the extent rights can be granted. Third-party components keep their original licenses.
