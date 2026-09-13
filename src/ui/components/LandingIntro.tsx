// Landing description shown on the no-save screen. Renders independent of disclaimer
// acceptance so it is present in the server-delivered/rendered DOM for search engines and
// link-preview crawlers (which never dismiss the disclaimer), while also giving first-time
// human visitors a plain-language summary of what the tool does. Purely static text - no
// state, no interactivity. The single <h1> lives in the TopBar; this uses <h2>/<h3>.

const FEATURES: ReadonlyArray<{ term: string; detail: string }> = [
  {
    term: '居民',
    detail: 'SPECIAL 属性、等级、幸福度、生命值、装备、外观，以及复活已死亡的居民。',
  },
  { term: '避难所', detail: '瓶盖、食物、水、电力、核子可乐、午餐盒和游戏模式。' },
  {
    term: '房间',
    detail: '重新规划布局、升级、应用主题、清除岩石和修复。',
  },
  {
    term: '赛季通行证',
    detail: '查看每个赛季的完整奖励轨道，领取错过的奖励。',
  },
  {
    term: '家谱',
    detail: '查看游戏中从不展示的避难所血脉与基因数据。',
  },
  {
    term: '物品图鉴',
    detail: '收录游戏中的全部武器、服装、宠物、垃圾和配方。',
  },
];

export function LandingIntro() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-8 text-neutral-300">
      <h2 className="text-xl font-semibold text-neutral-100">
        在浏览器中编辑《辐射：避难所》的避难所
      </h2>
      <p className="mt-3 text-sm leading-relaxed">
        一款免费开源的《辐射：避难所》存档编辑器。载入你的{' '}
        <code className="text-neutral-200">Vault1.sav</code>{' '}
        文件，修改避难所里几乎任何内容，再导出一份可用的存档放回游戏。所有操作都在你的浏览器中本地完成——你的存档绝不会被上传到任何服务器。
      </p>

      <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-neutral-400">
        功能一览
      </h3>
      <ul className="mt-2 space-y-1.5 text-sm leading-relaxed">
        {FEATURES.map((f) => (
          <li key={f.term}>
            <span className="font-medium text-neutral-100">{f.term}：</span>
            {f.detail}
          </li>
        ))}
      </ul>

      <p className="mt-6 text-xs leading-relaxed text-neutral-500">
        兼容来自 PC、Android、iOS 和 Switch 的存档。免费开源（MIT）。无账号、无广告、无遥测数据。
      </p>
    </section>
  );
}
