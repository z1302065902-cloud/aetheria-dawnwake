# 收费模式 / Pricing（按项目惯例 A）

对齐 STORMFRONT / NEO DRIFT 的既有惯例（见 `文档资料/STORMFRONT-多站收费.txt`）：

| 站点 | 模式 | 构建 |
|---|---|---|
| **itch.io** | **$1 Buy Now**（付费下载，删掉免费 html5 通道） | 完整版（十关） |
| **爱发电** | ✅ **已上架**「完整版 · 以太利亚·黎明觉醒」¥7（型号「标准版」，库存无限）→ https://afdian.com/item/0648e1dcb82911f19d2252540025c377 | 完整版（十关） |
| **GitHub Pages** | **免费试玩（前两关）** | 试玩版 `VITE_DEMO=1` |
| **Vercel** | **免费试玩（前两关）** | 试玩版 `VITE_DEMO=1` |
| **GitHub 源码** | MIT 源码仓库 | 源码（可自行构建完整版） |

## 试玩 / 完整版如何实现

`src/data/missions.ts`：

```ts
const ALL_MISSION_IDS  = ['m01' ... 'm10'];   // 完整版
const DEMO_MISSION_IDS = ['m01', 'm02'];      // 试玩版
export const IS_DEMO_BUILD = import.meta.env.VITE_DEMO === '1';
export const PLAYABLE_MISSIONS = new Set(IS_DEMO_BUILD ? DEMO_MISSION_IDS : ALL_MISSION_IDS);
```

- **完整版**：`npm run build` → `dist/`（默认，测试套件也用这个）
- **试玩版**：`VITE_DEMO=1 npm run build`
- 构建期确定，运行期不可绕过：菜单里 03–10 关显示「试玩版 · Demo」，点击提示去 itch/爱发电；
  代码里**没有**按关卡 id 直达的深链入口（已 grep 确认），存档也不含关卡解锁白名单绕过。
- 试玩版会在战役面板顶部显示购买引导（中英双语）。
- 门闸有**自动化验收**：`tests/release-checks/_verify-build-variants.mjs` 断言试玩版
  `playable == ["m01","m02"]`、完整版 `playable.length == 10`（读 `window.__AETHERIA__.__build`）。

## 部署对应关系

- Pages workflow 与 `vercel.json` 都用 `VITE_DEMO=1 npm run build` → 免费站只有前两关
- itch 付费下载包由 `npm run build`（完整版）打包上传
