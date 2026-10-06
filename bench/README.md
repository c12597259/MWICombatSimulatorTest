# 确定性战斗基准

在仓库根目录执行，需要已安装项目依赖及 Node 18 或更新版本。输入使用“全部玩家导出”的 JSON 对象（键为 `1`～`5`，值为角色导出 JSON 字符串或对象）。请把私人队伍放在仓库之外。输出目录 `.bench/` 已加入忽略列表。

```powershell
npm run bench -- --input "D:/path/to/team.txt" --bundle current --hours 72 --tier 2 --runs 3 --warmups 1 --out .bench/current-72h
```

默认地图是海盗基地，种子为 1。`--zone /actions/combat/aqua_planet` 可换地图；`--players 3` 取前三个角色；`--labyrinth /monsters/cyclops --room 150` 切换到迷宫。`--visualization` 开启 HP/MP 时序，`--metrics` 收集事件类型计数与队列最大长度（会增加计时开销）。默认不开额外社区/印章增益。本工具不执行页面对技能/食物槽位的输入裁剪，应提供可在页面正常使用的配置。

基准把种子随机数注入独立 Node 进程，并在每次运行后恢复 `Math.random`。不影响浏览器正式模拟。仅剔除团灭现实时间戳后，对完整结果进行哈希校验。报告中的内存为运行结束读数，不是峰值。

## 保存优化前后的版本

在动内核之前使用 `--bundle baseline` 编译并运行一次，之后不要覆盖它。修改后用 `--bundle current` 编译。`--reuse` 复用已经编译的快照，因此可以在同一工作目录交替测两个实现。首次加入基准的提交仅包含共享解析器与测试设施，可作为未来复现此次旧内核的起点。

```powershell
npm run bench -- --input "D:/path/to/team.txt" --bundle baseline --reuse --out .bench/baseline-72h
npm run bench -- --input "D:/path/to/team.txt" --bundle current --reuse --out .bench/current-72h
node bench/compare.cjs --input "D:/path/to/team.txt" --baseline baseline --current current
```

最后一条执行六个短场景，验证结果哈希与随机数调用次数一致。需要两个快照都已存在。它不是统计性能测试；正式测速度应关闭其他重负载程序，先预热，再顺序执行多次完整模拟并比较中位数。

报告与私有结果保存在 `.bench/`，不要提交。`npm test` 运行原有测试，`npm run test:combat` 运行新增内核与调度回归；`npm run build:production` 生成用于 GitHub Pages 的 `dist/`。

## Rust/WASM 迁移：冻结 JS 参考与公开对照

P0 新增冻结工具和人工公开队伍。它们不改变正式页面随机数或战斗逻辑。

```powershell
npm run bench:freeze -- --name js-reference-2783b09-p0
npm run test:parity-tools
npm run test:parity -- --reference js-reference-2783b09-p0
```

第一次冻结会在 `.bench/` 保存独立 JS 包、清单和源码备份，记录提交、代码/数据/依赖指纹、工具版本及包指纹。若该名字已存在，命令会拒绝覆盖，直接复用；新建参考使用新名字。冻结前要求战斗源码与数据没有未提交改动。基准运行时加 `--reuse`，会验证冻结包没有被修改。

当前公开测试有九个场景：原六类场景，加额外增益、迷宫箱子与成功通关。`tests/fixtures/combat/` 的队伍完全由 `bench/create-fixtures.cjs` 根据公开定义人工构造，不包含用户快照；测试会验证其槽位和定义引用。普通队伍并非最优配装，海盗 T2 失败也属于参考行为。成功通关用奇幻洞穴 T0，并要求至少完成一次。

每个实现/场景在独立 Node 进程运行，避免两个引擎共用全局 Worker 回调。比较完整 JSON、RNG 调用数和事件类型计数，忽略对象键顺序与团灭现实时间戳，保留数组顺序和所有游戏数值；失败会报告第一个差异路径，完整报告只写入 `.bench/parity/`。

`js-reference.expected.json` 保存人工队伍的规范化哈希和 RNG 次数，供以后校验冻结参考本身。`--record-golden` 只用于明确建立一份尚不存在的参考记录；不能覆盖现有记录，也不能用候选版结果自动更新。游戏定义或人工队伍确实要修改时，需要审查差异并有意更新参考版本，不能将失败结果直接当作新真值。`--suite` 可指定另一组本机对照场景，私人数据只使用仓库外或忽略目录。

旧 `hash` 字段保留原 JSON 顺序哈希，新增 `canonicalHash` 使用统一规范化；不要将二者混为一谈。规范化版本为 1。`run.cjs` 同时要求重复结果哈希和随机调用数一致，记录实际包指纹及冻结参考身份。

RNG 版本为 `mulberry32-js-number-v1`。它保留旧基准的 JS Number 累积状态，不等于一直 wrapping 的 u32 Mulberry32。种子 1 在第 4,917,760 次调用开始不同；72h 测试已经超过这一边界。公开长向量测试专门覆盖此处，Rust 迁移必须复现原流，不能只验证前一百万次。

72 小时可复现基准：

```powershell
npm run bench -- --input tests/fixtures/combat/synthetic-party.json --bundle js-reference-2783b09-p0 --reuse --hours 72 --tier 2 --seed 1 --warmups 2 --runs 5 --out .bench/rust-wasm-p0/js-reference-72h
```

计时范围是 Node 中真实 Worker 消息处理器，包括角色重建与模拟；不包含浏览器下载、消息克隆、页面渲染或结果哈希。这是后续对照基础，不是浏览器端到端速度或峰值内存结论。P0 结果和下一阶段见 `docs/rust-wasm-combat-p0-results.zh-CN.md`。
