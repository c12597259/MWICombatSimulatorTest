# 迷宫 WASM 接口和升级面板

2026-10-08。配套计算器版本：`1.5.14-custom.8`。

## 页面行为

模拟配置移除“模拟所有迷宫”。勾选“模拟迷宫”后，个人增益区域替换为当前角色的迷宫升级：战斗伤害、攻击速度、施法速度、暴击率、经验。每级 1%，与计算器已有游戏升级映射一致。等级随角色切换、单人/团队导入导出和保存配装保留。计算器右键导出的 `importSet.labyrinth` 会被读取；旧配装没有该字段时默认零级。

JS 回退和 Rust 请求适配器均排除迷宫中的个人增益、普通食品和饮料，保留补给箱及迷宫升级。普通地图不应用迷宫升级。Rust 核心也会忽略迷宫请求中的 `extra.personalBuffs`。

## 接口 v1

固定入口为 `dist/labyrinth-worker.js`。普通 Worker 可直接加载；游戏域名下的计算器先 fetch 代码，再通过 Blob Worker 执行，前置 `self.__mwiLabAssetBase = 模拟器dist目录URL`，解决跨站 Worker 和相对资源路径问题。不再依赖 Webpack 内部模块编号或压缩后类名。

发送：

```js
{
  type: 'simulate_room', apiVersion: 1, requestId: 1,
  playerDto, extraBuffs: [],
  monsterHrid: '/monsters/giant_scorpion', mazeDifficulty: 100,
  mazeCrateItemHrids: [], roomDurationSeconds: 120, trials: 100,
  seed: 7 // 可选；不提供则生成随机种子
}
```

返回 `room_progress`、`room_result` 或 `room_error`，都带 `requestId`。结果带 `execution.engine = rust-wasm-worker`、种子、数据指纹和 WASM 哈希。WASM 不可用时报告错误；计算器不会静默使用旧 JS 引擎。标准模拟器保留 JS 加载失败回退。

沿用原计算器的 `120秒 × trials` 模拟时长。结果 `trials` 是实际结束的场次，等于成功、死亡和超时之和；未结束的最后一场不计入。耗时最小值、最大值和累计时间由 Rust 在场次结束时汇总，无需保留逐场日志。

`playerDto.labyrinthUpgrades` 支持原计算器 `/buff_uniques/labyrinth_upgrade_*` 键，也支持 `labyrinthCombatDamageLevel` 等导入字段。提供等级时，以等级为准，去掉 `extraBuffs` 中重复的迷宫升级；其他社区增益继续保留。

## 缓存和版本

计算器接口代码仍存于游戏域名 IndexedDB，适配器签名变更会失效旧 JS 缓存。资源放在 Cache Storage 的 `mwi-combat-wasm-assets-v1`；每次读取校验 SHA-256，损坏时重取，最多保留 8 个资源。存储禁用或写满不妨碍在线运行。角色数据不随资源缓存，不使用 GM 存储。

## 验证

- `npm run test:labyrinth`：增益去重、普通地图隔离、迷宫排除个人增益，以及成功/死亡/超时/未完成四类场次的固定种子 JS/WASM 对照。
- `npm test`、`npm run test:combat`、`npm run test:frontend`。
- `node scripts/test-rust.cjs`：格式、Rust 测试、Clippy。
- `npm run test:labyrinth-browser`：设置 `MWI_LABYRINTH_SCRIPT` 为本地计算器脚本路径；可通过 `MWI_PLAYWRIGHT_PATH` 指定 Playwright。覆盖真实页面导入、切换角色、未失焦的输入、实际 WASM 请求、跨站 Blob Worker 和计算器桥接。
- 原计算器目录 `qa/calculator.test.cjs`、`qa/cache_check.py`：16 项回归测试及浏览器原生缓存、离线复用、后台更新、损坏缓存重试、存储失败。

浏览器使用构造的角色数据，未修改登录中的游戏角色或 Tampermonkey 安装。
