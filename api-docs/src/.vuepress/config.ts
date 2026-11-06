import { viteBundler } from '@vuepress/bundler-vite'
import { defaultTheme } from '@vuepress/theme-default'
import { defineUserConfig } from 'vuepress'

const repo = 'https://github.com/Sparklingstadt/typle-r'

// The default slugify of @mdit-vue/shared, ending in NFC: it decomposes with NFKD and strips only the Latin combining
// marks, so 「パ」 would stay as 「ハ」 + U+309A and links written as 「パ」 would not reach the heading.
const slugify = (title: string) => title.normalize('NFKD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[\u0000-\u001f]/g, '')
  .replace(/[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g, '-')
  .replace(/-{2,}/g, '-')
  .replace(/^-+|-+$/g, '')
  .replace(/^(\d)/, '_$1')
  .toLowerCase()
  .normalize('NFC')

export default defineUserConfig({
  lang: 'ja-JP',
  title: 'Typle API',
  description: 'Typle のアプリのAPI（/api/*）の仕様',
  port: 8090,
  markdown: { slugify },
  bundler: viteBundler(),
  theme: defaultTheme({
    repo,
    docsRepo: repo,
    docsBranch: 'main',
    docsDir: 'api-docs/src',
    editLinkText: 'GitHub でこのページを編集',
    lastUpdated: false,
    contributors: false,
    navbar: [
      { text: 'アプリのAPI', link: '/app/' },
      { text: 'OpenAPI', link: '/openapi.md' },
    ],
    sidebar: {
      '/app/': [
        {
          text: 'アプリのAPI（/api/*）',
          children: ['/app/', '/app/workspace.md', '/app/shares.md', '/app/auth.md', '/app/admin.md', '/app/graphql.md', '/app/validation.md'],
        },
      ],
      '/openapi': [
        { text: 'OpenAPI', children: ['/openapi.md'] },
      ],
    },
    sidebarDepth: 2,
    tip: 'ヒント',
    warning: '注意',
    danger: '警告',
    notFound: ['ページが見つかりません'],
    backToHome: 'ホームへ戻る',
    openInNewWindow: '新しいウィンドウで開く',
    toggleColorMode: '表示色の切り替え',
    toggleSidebar: 'サイドバーの切り替え',
    prev: '前のページ',
    next: '次のページ',
  }),
})
