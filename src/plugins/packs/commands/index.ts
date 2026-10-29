// Made by scripts/generate-packs.cjs from manifest.json: run `npm run packs:generate` after changing the lists.
import { isInputType, type SavedWordList } from '../../../core/wordLists'
import list0 from './macos-zsh-commands.json'
import list1 from './aws-cli-commands.json'
import list2 from './gcloud-cli-commands.json'
import list3 from './linux-system.json'
import list4 from './linux-shell-bash.json'
import list5 from './linux-commands-advanced.json'
import list6 from './linux-command-options.json'
import list7 from './linux-commands-basic.json'
import list8 from './vercel-cli-commands.json'
import list9 from './arch-linux.json'
import list10 from './arch-linux-beginner.json'
import list11 from './arch-linux-intermediate.json'
import list12 from './arch-linux-advanced.json'
import list13 from './vim.json'
import list14 from './vim-beginner.json'
import list15 from './vim-intermediate.json'
import list16 from './vim-advanced.json'
import list17 from './go-syntax-beginner.json'
import list18 from './go-syntax-intermediate.json'
import list19 from './go-syntax-advanced.json'
import list20 from './java-syntax-beginner.json'
import list21 from './java-syntax-intermediate-1.json'
import list22 from './java-syntax-intermediate-2.json'
import list23 from './java-syntax-advanced.json'
import list24 from './kotlin-syntax-beginner-1.json'
import list25 from './kotlin-syntax-beginner-2.json'
import list26 from './kotlin-syntax-intermediate.json'
import list27 from './kotlin-syntax-advanced-1.json'
import list28 from './kotlin-syntax-advanced-2.json'
import list29 from './un-member-states-chinese-193-lowercase.json'
import list30 from './un-member-states-chinese-193-lowercase-beginner-1.json'
import list31 from './un-member-states-chinese-193-lowercase-beginner-2.json'
import list32 from './un-member-states-chinese-193-lowercase-intermediate.json'
import list33 from './un-member-states-chinese-193-lowercase-advanced-1.json'
import list34 from './un-member-states-chinese-193-lowercase-advanced-2.json'
import list35 from './postgresql-syntax-beginner.json'
import list36 from './postgresql-syntax-intermediate-1.json'
import list37 from './postgresql-syntax-intermediate-2.json'
import list38 from './postgresql-syntax-advanced.json'
import list39 from './prisma-syntax-beginner.json'
import list40 from './prisma-syntax-advanced.json'
import list41 from './jest-syntax-beginner.json'
import list42 from './jest-syntax-advanced.json'
import list43 from './playwright-syntax-beginner.json'
import list44 from './playwright-syntax-advanced.json'
import list45 from './typescript-syntax-beginner.json'
import list46 from './typescript-syntax-intermediate.json'
import list47 from './typescript-syntax-advanced.json'
import list48 from './hono-methods-beginner.json'
import list49 from './hono-methods-intermediate.json'
import list50 from './hono-methods-advanced.json'
import list51 from './php-syntax-beginner.json'
import list52 from './php-syntax-intermediate.json'
import list53 from './php-syntax-advanced.json'
import list54 from './rails-methods-beginner.json'
import list55 from './rails-methods-intermediate.json'
import list56 from './rails-methods-advanced.json'
import list57 from './express-methods-beginner.json'
import list58 from './express-methods-intermediate.json'
import list59 from './express-methods-advanced.json'
import list60 from './oracle-plsql-syntax-beginner.json'
import list61 from './oracle-plsql-syntax-intermediate.json'
import list62 from './oracle-plsql-syntax-advanced.json'
import list63 from './sql-server-tsql-syntax-beginner.json'
import list64 from './sql-server-tsql-syntax-intermediate.json'
import list65 from './sql-server-tsql-syntax-advanced.json'
import list66 from './korean-basics.json'
import list67 from './french-basics.json'
import list68 from './czech-basics.json'
import list69 from './german-basics.json'
import list70 from './spanish-basics.json'
import list71 from './chinese-basics.json'

const commands: SavedWordList[] = [
  list0,
  list1,
  list2,
  list3,
  list4,
  list5,
  list6,
  list7,
  list8,
  list9,
  list10,
  list11,
  list12,
  list13,
  list14,
  list15,
  list16,
  list17,
  list18,
  list19,
  list20,
  list21,
  list22,
  list23,
  list24,
  list25,
  list26,
  list27,
  list28,
  list29,
  list30,
  list31,
  list32,
  list33,
  list34,
  list35,
  list36,
  list37,
  list38,
  list39,
  list40,
  list41,
  list42,
  list43,
  list44,
  list45,
  list46,
  list47,
  list48,
  list49,
  list50,
  list51,
  list52,
  list53,
  list54,
  list55,
  list56,
  list57,
  list58,
  list59,
  list60,
  list61,
  list62,
  list63,
  list64,
  list65,
  list66,
  list67,
  list68,
  list69,
  list70,
  list71,
].map(list => ({
  ...list,
  words: list.words.map(word => {
    if (!isInputType(word.input_type)) throw new Error('Invalid official input_type')
    return { ...word, input_type: word.input_type }
  }),
}))

export default commands
