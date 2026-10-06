# Rust/WASM 正式页面接入

2026-10-06，暂停性能微优化，将已验证的 Rust 战斗引擎接入当前发布页面。

## 用户路径

- 单图、地下城、迷宫和批量地图/迷宫默认使用 `rustWorker.js`；批量沿用现有 Worker 池，复用已初始化引擎，结果按请求顺序返回。
- 保留原来的结果消息、进度条、血蓝曲线、停止按钮、结果展示和历史记录。停止时终止 Worker，重新开始使用新实例。
- WASM 或定义资源加载/校验失败时，由子 Worker 使用原 JS 引擎；Rust 计算过程报错直接报告，不静默换引擎。
- 每个 Rust 任务生成独立随机种子，固定种子仅用于回放/验证。导出记录保存实际引擎、种子、WASM 哈希及数据指纹；批量 `execution.executions` 与结果、目标索引对应。旧 JS 历史仍标记为无精确随机回放。

## 接口与构建

Rust 战斗规则与计算算法不变。为页面增加只读 `time_series()` 和消耗运行状态的 `finish()`：前者提供实时曲线，后者沿用之前的结果所有权转移路径，避免分块执行结束后复制完整日志。`finish()` 未完成时拒绝调用，完成后不能再读取或推进该任务；JS 始终在 finally 中释放句柄。

每次推进最多 10,000 个事件，约每 100ms 发送进度并让出执行权。仅开启可视化时传曲线。普通模拟和批量计算均在 Worker 内完成。

`npm run build:production` 先从锁定的 Rust 工具链构建 WASM 和数据，再打包前端。WASM、定义及 Worker 使用带内容哈希的文件名、相对 publicPath，兼容站点根路径和 GitHub Pages 子路径。运行时校验资源 SHA-256、接口版本、RNG 版本和数据指纹。发行目录包含 Rust 第三方许可说明。

## 验证与发布

- `npm test`：业务回归。
- `npm run test:rust`：Rust 单元测试、fmt、Clippy。
- `npm run test:frontend`：分块/一次性输出一致、实时曲线、完成与释放边界、记录元数据及池行为。
- `npm run test:frontend-browser`：实际生产页面及实际 Worker，含结果、进度、池复用、非法输入后再运行、批量顺序、界面操作、历史/导出、停止/重启、加载失败回退和 Pages 子路径。
- 浏览器脚本使用 `MWI_PLAYWRIGHT_PATH` 定位已安装 Playwright；可用 `MWI_SIMULATION_REFERENCE` 指向冻结模拟参考目录，`MWI_FRONTEND_CASES` 指向本地私有请求与期望哈希列表。私有输入及浏览器报告只保存到忽略目录。

发布沿用 Pages 当前来源 `codex/temporary-simulation-export` 和 `/dist/` 地址，保留临时记录导出功能。该分支合并了 `codex/rust-wasm-migration` 的已验证提交。JS `testing` 分支保留，作为上一版来源；没有修改用户主工作目录里的未提交文件。

冷启动包含额外 WASM/定义下载与初始化，因此上一轮约 2.39× 的热计算速度不能当作页面每次操作的提速承诺。
