/**
 * The statement that sits beside every authentication form.
 *
 * The three steps are the product's own sequence, worded as the public home
 * page words them: a guest who arrives at `/register` from a shared link never
 * sees the home page, so the argument has to reach the page where the decision
 * to sign up is actually made. It is a statement of what the product does, not
 * a sales pitch — these pages stay forms first.
 */
export const authAsideCopy = {
  en: {
    title: 'A decision stays readable through three steps',
    points: [
      ['Record', 'Write the original thesis, observation and uncertainty while the decision is fresh.'],
      ['Connect evidence', 'Keep research and transactions close to the decision they explain.'],
      ['Review', 'Return later, compare the outcome with the original reasoning, and record what changed.'],
    ],
    signIn: 'Pick up the record where you left it. Everything you wrote stays as you wrote it.',
    register: 'A diary for investment decisions: record the reasoning, keep the evidence beside it, and review it later.',
    recovery: 'Account recovery restores access to the record. Nothing you wrote changes.',
  },
  'zh-TW': {
    title: '一個決策透過三步保持可讀',
    points: [
      ['記錄', '在決策仍然清晰時，寫下原本的論點、觀察和不確定之處。'],
      ['連結證據', '把研究和交易放在能解釋它們的決策旁邊。'],
      ['複盤', '之後回看，把結果與原本的思路比較，並記下甚麼改變了。'],
    ],
    signIn: '回到上次停下的地方，你寫過的內容都會保持原樣。',
    register: '一本投資決策日記：記下理由，把證據放在旁邊，日後再回來複盤。',
    recovery: '帳戶復原只會恢復存取權限，不會改動你寫過的內容。',
  },
  'zh-CN': {
    title: '一个决策通过三步保持可读',
    points: [
      ['记录', '在决策仍然清晰时，写下原本的论点、观察和不确定之处。'],
      ['连接证据', '把研究和交易放在能解释它们的决策旁边。'],
      ['复盘', '之后回看，把结果与原本的思路比较，并记下什么改变了。'],
    ],
    signIn: '回到上次停下的地方，你写过的内容都会保持原样。',
    register: '一本投资决策日记：记下理由，把证据放在旁边，日后再回来复盘。',
    recovery: '账户恢复只会恢复访问权限，不会改动你写过的内容。',
  },
} as const;
