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
