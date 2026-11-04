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
import list72 from './english-basic-words.json'
import list73 from './english-basic-syntax.json'
import list74 from './english-intermediate-words.json'
import list75 from './english-intermediate-syntax.json'
import list76 from './russian-basic-words.json'
import list77 from './russian-basic-syntax.json'
import list78 from './russian-intermediate-words.json'
import list79 from './russian-intermediate-syntax.json'
import list80 from './czech-intermediate-words.json'
import list81 from './czech-intermediate-syntax.json'
import list82 from './chinese-hsk5-words-1.json'
import list83 from './chinese-hsk5-words-2.json'
import list84 from './chinese-hsk6-words-1.json'
import list85 from './chinese-hsk6-words-2.json'
import list86 from './postgresql-error-codes-beginner.json'
import list87 from './postgresql-error-codes-intermediate.json'
import list88 from './postgresql-error-codes-advanced.json'
import list89 from './chinese-hsk6-handwriting-1-words-1.json'
import list90 from './chinese-hsk6-handwriting-1-words-2.json'
import list91 from './chinese-hsk6-handwriting-1-words-3.json'
import list92 from './chinese-hsk6-handwriting-1-words-4.json'
import list93 from './chinese-hsk6-handwriting-1-words-5.json'
import list94 from './chinese-hsk6-handwriting-1-words-6.json'
import list95 from './chinese-hsk6-handwriting-2-words-1.json'
import list96 from './chinese-hsk6-handwriting-2-words-2.json'
import list97 from './chinese-hsk6-handwriting-2-words-3.json'
import list98 from './chinese-hsk6-handwriting-2-words-4.json'
import list99 from './chinese-hsk6-handwriting-2-words-5.json'
import list100 from './chinese-hsk6-handwriting-2-words-6.json'
import list101 from './chinese-hsk6-handwriting-3-words-1.json'
import list102 from './chinese-hsk6-handwriting-3-words-2.json'
import list103 from './chinese-hsk6-handwriting-3-words-3.json'
import list104 from './chinese-hsk6-handwriting-3-words-4.json'
import list105 from './chinese-hsk6-handwriting-3-words-5.json'
import list106 from './chinese-hsk6-handwriting-3-words-6.json'
import list107 from './chinese-hsk6-handwriting-4-words-1.json'
import list108 from './chinese-hsk6-handwriting-4-words-2.json'
import list109 from './chinese-hsk6-handwriting-4-words-3.json'
import list110 from './chinese-hsk6-handwriting-4-words-4.json'
import list111 from './chinese-hsk6-handwriting-4-words-5.json'
import list112 from './chinese-hsk6-handwriting-4-words-6.json'
import list113 from './chinese-hsk6-handwriting-5-words-1.json'
import list114 from './chinese-hsk6-handwriting-5-words-2.json'
import list115 from './chinese-hsk6-handwriting-5-words-3.json'
import list116 from './chinese-hsk6-handwriting-5-words-4.json'
import list117 from './chinese-hsk6-handwriting-5-words-5.json'
import list118 from './chinese-hsk6-handwriting-5-words-6.json'
import list119 from './chinese-hsk6-handwriting-6-words-1.json'
import list120 from './chinese-hsk6-handwriting-6-words-2.json'
import list121 from './chinese-hsk6-handwriting-6-words-3.json'
import list122 from './chinese-hsk6-handwriting-6-words-4.json'
import list123 from './chinese-hsk6-handwriting-6-words-5.json'
import list124 from './chinese-hsk6-handwriting-6-words-6.json'
import list125 from './chinese-hsk6-handwriting-7-words-1.json'
import list126 from './chinese-hsk6-handwriting-7-words-2.json'
import list127 from './chinese-hsk6-handwriting-7-words-3.json'
import list128 from './chinese-hsk6-handwriting-7-words-4.json'
import list129 from './chinese-hsk6-handwriting-7-words-5.json'
import list130 from './chinese-hsk6-handwriting-7-words-6.json'
import list131 from './chinese-hsk6-handwriting-8-words-1.json'
import list132 from './chinese-hsk6-handwriting-8-words-2.json'
import list133 from './chinese-hsk6-handwriting-8-words-3.json'
import list134 from './chinese-hsk6-handwriting-8-words-4.json'
import list135 from './chinese-hsk6-handwriting-8-words-5.json'
import list136 from './chinese-hsk6-handwriting-8-words-6.json'
import list137 from './chinese-hsk6-handwriting-9-words-1.json'
import list138 from './chinese-hsk6-handwriting-9-words-2.json'
import list139 from './chinese-hsk6-handwriting-9-words-3.json'
import list140 from './chinese-hsk6-handwriting-9-words-4.json'
import list141 from './chinese-hsk6-handwriting-9-words-5.json'
import list142 from './chinese-hsk6-handwriting-9-words-6.json'
import list143 from './chinese-hsk6-handwriting-10-words-1.json'
import list144 from './chinese-hsk6-handwriting-10-words-2.json'
import list145 from './chinese-hsk6-handwriting-10-words-3.json'
import list146 from './chinese-hsk6-handwriting-10-words-4.json'
import list147 from './chinese-hsk6-handwriting-10-words-5.json'
import list148 from './chinese-hsk6-handwriting-10-words-6.json'
import list149 from './chinese-hsk6-handwriting-11-words-1.json'
import list150 from './chinese-hsk6-handwriting-11-words-2.json'
import list151 from './chinese-hsk6-handwriting-11-words-3.json'
import list152 from './chinese-hsk6-handwriting-11-words-4.json'
import list153 from './chinese-hsk6-handwriting-11-words-5.json'
import list154 from './chinese-hsk6-handwriting-11-words-6.json'
import list155 from './chinese-hsk6-handwriting-12-words-1.json'
import list156 from './chinese-hsk6-handwriting-12-words-2.json'
import list157 from './chinese-hsk6-handwriting-12-words-3.json'
import list158 from './chinese-hsk6-handwriting-12-words-4.json'
import list159 from './chinese-hsk6-handwriting-12-words-5.json'
import list160 from './chinese-hsk6-handwriting-12-words-6.json'
import list161 from './chinese-hsk6-handwriting-13-words-1.json'
import list162 from './chinese-hsk6-handwriting-13-words-2.json'
import list163 from './chinese-hsk6-handwriting-13-words-3.json'
import list164 from './chinese-hsk6-handwriting-13-words-4.json'
import list165 from './chinese-hsk6-handwriting-13-words-5.json'
import list166 from './chinese-hsk6-handwriting-13-words-6.json'
import list167 from './chinese-hsk6-handwriting-14-words-1.json'
import list168 from './chinese-hsk6-handwriting-14-words-2.json'
import list169 from './chinese-hsk6-handwriting-14-words-3.json'
import list170 from './chinese-hsk6-handwriting-14-words-4.json'
import list171 from './chinese-hsk6-handwriting-14-words-5.json'
import list172 from './chinese-hsk6-handwriting-14-words-6.json'
import list173 from './chinese-hsk6-handwriting-15-words-1.json'
import list174 from './chinese-hsk6-handwriting-15-words-2.json'
import list175 from './chinese-hsk6-handwriting-15-words-3.json'
import list176 from './chinese-hsk6-handwriting-15-words-4.json'
import list177 from './chinese-hsk6-handwriting-15-words-5.json'
import list178 from './chinese-hsk6-handwriting-15-words-6.json'
import list179 from './chinese-hsk6-handwriting-16-words-1.json'
import list180 from './chinese-hsk6-handwriting-16-words-2.json'
import list181 from './chinese-hsk6-handwriting-16-words-3.json'
import list182 from './chinese-hsk6-handwriting-16-words-4.json'
import list183 from './chinese-hsk6-handwriting-16-words-5.json'
import list184 from './chinese-hsk6-handwriting-16-words-6.json'
import list185 from './chinese-hsk6-handwriting-17-words-1.json'
import list186 from './chinese-hsk6-handwriting-17-words-2.json'
import list187 from './chinese-hsk6-handwriting-17-words-3.json'
import list188 from './chinese-hsk6-handwriting-17-words-4.json'
import list189 from './chinese-hsk6-handwriting-17-words-5.json'
import list190 from './chinese-hsk6-handwriting-17-words-6.json'
import list191 from './chinese-hsk6-handwriting-18-words-1.json'
import list192 from './chinese-hsk6-handwriting-18-words-2.json'
import list193 from './chinese-hsk6-handwriting-18-words-3.json'
import list194 from './chinese-hsk6-handwriting-18-words-4.json'
import list195 from './chinese-hsk6-handwriting-18-words-5.json'
import list196 from './chinese-hsk6-handwriting-18-words-6.json'
import list197 from './chinese-hsk6-handwriting-19-words-1.json'
import list198 from './chinese-hsk6-handwriting-19-words-2.json'
import list199 from './chinese-hsk6-handwriting-19-words-3.json'
import list200 from './chinese-hsk6-handwriting-19-words-4.json'
import list201 from './chinese-hsk6-handwriting-19-words-5.json'
import list202 from './chinese-hsk6-handwriting-19-words-6.json'
import list203 from './chinese-hsk6-handwriting-20-words-1.json'
import list204 from './chinese-hsk6-handwriting-20-words-2.json'
import list205 from './chinese-hsk6-handwriting-20-words-3.json'
import list206 from './chinese-hsk6-handwriting-20-words-4.json'
import list207 from './chinese-hsk6-handwriting-20-words-5.json'
import list208 from './chinese-hsk6-handwriting-20-words-6.json'
import list209 from './korean-handwriting-beginner-words-1.json'
import list210 from './korean-handwriting-beginner-words-2.json'
import list211 from './korean-handwriting-beginner-words-3.json'
import list212 from './korean-handwriting-beginner-words-4.json'
import list213 from './korean-handwriting-beginner-words-5.json'
import list214 from './korean-handwriting-beginner-words-6.json'

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
  list72,
  list73,
  list74,
  list75,
  list76,
  list77,
  list78,
  list79,
  list80,
  list81,
  list82,
  list83,
  list84,
  list85,
  list86,
  list87,
  list88,
  list89,
  list90,
  list91,
  list92,
  list93,
  list94,
  list95,
  list96,
  list97,
  list98,
  list99,
  list100,
  list101,
  list102,
  list103,
  list104,
  list105,
  list106,
  list107,
  list108,
  list109,
  list110,
  list111,
  list112,
  list113,
  list114,
  list115,
  list116,
  list117,
  list118,
  list119,
  list120,
  list121,
  list122,
  list123,
  list124,
  list125,
  list126,
  list127,
  list128,
  list129,
  list130,
  list131,
  list132,
  list133,
  list134,
  list135,
  list136,
  list137,
  list138,
  list139,
  list140,
  list141,
  list142,
  list143,
  list144,
  list145,
  list146,
  list147,
  list148,
  list149,
  list150,
  list151,
  list152,
  list153,
  list154,
  list155,
  list156,
  list157,
  list158,
  list159,
  list160,
  list161,
  list162,
  list163,
  list164,
  list165,
  list166,
  list167,
  list168,
  list169,
  list170,
  list171,
  list172,
  list173,
  list174,
  list175,
  list176,
  list177,
  list178,
  list179,
  list180,
  list181,
  list182,
  list183,
  list184,
  list185,
  list186,
  list187,
  list188,
  list189,
  list190,
  list191,
  list192,
  list193,
  list194,
  list195,
  list196,
  list197,
  list198,
  list199,
  list200,
  list201,
  list202,
  list203,
  list204,
  list205,
  list206,
  list207,
  list208,
  list209,
  list210,
  list211,
  list212,
  list213,
  list214,
].map(list => ({
  ...list,
  words: list.words.map(word => {
    if (!isInputType(word.input_type)) throw new Error('Invalid official input_type')
    return { ...word, input_type: word.input_type }
  }),
}))

export default commands
