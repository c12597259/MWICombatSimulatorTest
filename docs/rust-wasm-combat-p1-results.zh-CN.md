# Rust/WASM 第二步 P1：工具链与浏览器原型

日期：2026-09-30。P1 已完成，下一步是 P2 完整单图实现。本文记录原型验证，不代表完整战斗已经迁移，也不提供整场模拟提速结论。

## 已实现内容

本机安装固定 Rust 工具链和 WASM 构建工具，建立 `rust/combat-core` 与 `rust/combat-wasm` 工作区。纯 Rust 核心包含兼容 RNG、事件堆、定义数据解析和 JS round；WASM 包装提供原型对象、分段随机流和显式释放接口。

独立 `prototype/` 页面通过真正的 Worker 运行编译后的 WASM。模块和公开定义每个 Worker 初始化一次；任务分别创建 RNG 对象，结束或异常时释放。取消通过终止 Worker 实现，重开后重新初始化。没有逐次随机调用 JS。

当前正式页面、JS 战斗核心和 `dist/` 未修改。私有插件、账号快照、同步服务器和 FRP 不在本步范围，原型只使用公开定义与人工测试数据。

## 固定工具与构建

| 项目 | 固定版本 / 状态 |
| --- | --- |
| Rust | 1.98.1，`rustc 1.98.1 (48a229cea 2026-09-01)` |
| Cargo | 1.98.1，`797e8a9bc 2026-08-05` |
| 编译目标 | `wasm32-unknown-unknown` 已安装 |
| wasm-pack | 0.15.0 |
| wasm-bindgen | 0.2.129 |
| serde / serde_json | 1.0.229 / 1.0.151，JSON 对象保留插入顺序 |
| Windows 本地编译 | 使用已有 Visual Studio 2022 C++ Build Tools |
| Node / npm | 沿用 18.16.1 / 9.5.1 |

Rust 由[官方 rustup 入口](https://rust-lang.org/tools/install/)安装，安装器与官方 SHA256 一致。wasm-pack 使用[官方 0.15.0 发布包](https://github.com/wasm-bindgen/wasm-pack/releases/tag/v0.15.0)，核对发布资产摘要。工具安装在当前用户 `.cargo/bin`，同步服务器无需安装 Rust。

`rust-toolchain.toml` 固定 Rust、目标、rustfmt 和 Clippy；`rust/Cargo.lock` 锁定依赖。脚本核对 rustc/wasm-pack 版本，并把用户 `.cargo/bin` 加入子进程 PATH，避免已打开的终端沿用旧 PATH。构建传递 Cargo `--locked`。

资源生成到忽略目录 `.wasm-build/`。清单包含源定义指纹、生成器/接口/RNG 版本、数据资产 SHA256 和 WASM/包装文件 SHA256。编译时把定义指纹写入 WASM；Worker 核对实际资产字节、接口与模块指纹，拒绝错误组合。Webpack 以内容指纹文件名输出资源，URL 相对于当前 Worker，不写死网站根路径。

开始构建时撤销旧成功清单和浏览器就绪标记，全部成功后才重新生成，避免失败时使用旧产物冒充本次成功。P1 暂不运行 wasm-opt；release 使用 opt-level 3、thin LTO、单 codegen unit 和 panic abort。

## 算法对照

RNG 继续使用 `mulberry32-js-number-v1`。Rust 的 f64 累积状态复现 JS Number，整数混合采用 wrapping-u32，显式模 2^32 转换不能使用 Rust 饱和转换。种子 `0、1、42、4294967295` 各推进至 600 万次，所有公开检查点完全一致，覆盖约第 491 万次后的精度边界。

Rust 本地、Node 执行实际 WASM、真实浏览器 Worker 三层都通过长向量。分段保留同一对象状态；WASM 验证 1 的短分段和 999/1000/1001/10000 的长分段，浏览器验证 50000/50001/100000 的长分段。这证明 RNG 连续性，战斗事件分段将在 P2 后另做完整结果对照。

队列适配锁定的 heap-js 2.2.0 算法，复用原 JS 的 5000 次随机操作序列，逐步对比堆数组、弹出、删除和匹配结果，补充同时间事件、队首/队中/末尾删除、清空后重插等案例。同时间八事件的弹出顺序保留 `1,8,7,6,5,4,3,2`。第三方许可保存在 `rust/THIRD-PARTY-NOTICES.md`，同时复制到浏览器原型。

数值原型验证 JS round、负半数、负零、大整数、非有限数和余数。属性公式、默认值转换、`pow(..., 1.4)`、伤害/治疗/状态效果尚未迁移，本步不能证明这些规则一致。

## 真实浏览器验收

用户在本机 Edge 154.0.0.0 打开两个自动验收页面；页面在浏览器内运行实际 Worker 后，通过回环服务保存报告。自动浏览器控制曾因 URL 识别策略停止，本次验收依据用户实际运行产生的两份报告，不声称已修复控制接口。

| 路径 | 结果 | 首次 Worker 初始化测试耗时 |
| --- | --- | ---: |
| `/` | 12/12 通过 | 98 ms |
| `/MWICombatSimulatorTest/dist/` | 12/12 通过 | 114 ms |

两份报告验证以下内容：

1. 真正的 Worker 初始化 WASM 和全部 16 份公开定义。
2. URL 跟随根路径或 Pages 子路径，WASM MIME 为 `application/wasm`，Response 初始化可用。
3. 四种子各 600 万次 RNG 与冻结 JS 向量一致。
4. 改变分段大小后跨越 Number 精度边界的随机流一致。
5. 5000 次队列操作及针对性边界逐步对齐实际 JS。
6. 取整、负零、余数及非有限数语义一致。
7. 重复任务复用模块和数据，非法输入/指纹错误后继续运行，临时 RNG 对象释放。
8. 同一 Worker 正在运行时，第二项任务收到 BUSY。
9. 显式 free 后对象计数归零，重建引擎仍复用模块和定义。
10. WASM 404、数据 404、错误 WASM/数据字节指纹后可重试初始化。
11. 普通字节初始化路径可用，两个 Worker 的实例状态独立。
12. Rust 已执行一段后取消 Worker，重开后种子与状态重新建立。

复用时 moduleInitCount=1、engineInitCount=1、dataFetchCount=1、liveProbes=0。两次显式释放并重建后最终 engineInitCount=3，模块和数据仍只初始化一次。

初始 WASM 线性内存容积为 17,891,328 字节，原型全部操作后为 19,005,440 字节。free 验证 Rust 对象计数归零，不要求线性内存立即缩小。这些读数不是浏览器进程峰值，也不证明完整战斗内存门槛通过。

原始报告被忽略，保存在 `.bench/rust-wasm-p1/browser-root.json` 与 `browser-pages.json`。`test:wasm-browser-reports` 检查报告比本次原型构建新、12 项均通过、指纹一致、实例生命周期与路径正确。重新构建后必须重跑浏览器，不能沿用旧报告。

## 指纹与产物

| 内容 | SHA256 / 大小 |
| --- | --- |
| 原 JS 引擎源码 | `c02aa7ba0d14cd16da73c65baf91c681be3a8a7800958b722437fb25610d8c0a` |
| 公开游戏定义源码 | `dd2169d14584689aa7d0880bd220edb41e71a9a27430731e8db0a8d8b0bddd37` |
| 生成的数据资源 | `b92cb7206695fa36547a094b7b39de39e5a6035ea58e2461d8c7ac6db3183526`，2,236,079 字节 |
| 原型 WASM | `c08b15f8f0fa1767870e73fa94225a7b4b7014b52965b2ab369454c56e228b8b`，238,420 字节 |

JS 引擎与定义源码指纹仍与 P0 冻结参考一致。JSON 资源是全部原定义的紧凑序列化，没有按字段裁剪。

## 命令与回归

在正式模拟器目录执行：

```powershell
npm run test:rust
npm run build:wasm-prototype
npm run test:wasm
npm run start:wasm-prototype
```

最后一个命令保持运行，默认只监听 `127.0.0.1:9011`。打开 `http://127.0.0.1:9011/` 和 `http://127.0.0.1:9011/MWICombatSimulatorTest/dist/`，等待验收结束，再在另一终端执行：

```powershell
npm run test:wasm-browser-reports
```

可通过 `MWI_PROTOTYPE_PORT` 改端口。原型不要求登录游戏或读取私人配置。

本步结果：Rust 7 项单元测试、格式检查与 Clippy 通过；实际 WASM 7 项子测试通过；两条浏览器路径各 12 项通过；原有 97 项业务、11 项战斗/Worker、10 项对照工具测试全部通过。九个公开完整 JS 场景与冻结参考的结果、RNG 次数和事件计数一致。这九场景仍是 JS 回归，不是完整 Rust 战斗对照。

本步没有重跑 72h 性能基准，因为正式 JS 引擎未改，Rust 完整战斗尚未实现。原型测试时间不能作为实际战斗提速证据。

## 下一步

P2 从规范化输入、角色属性、稳定身份及运行状态开始，接入已对齐的 RNG 与事件队列，完成一组代表性人工队伍的连续地下城和完整统计。复用 P0 冻结 JS 定位第一次差异，单图完整对齐后才做真实浏览器性能初测；P3 补全其余规则。P1 保持本地开发阶段提交，正式页面继续使用 JS。
