import json, os
LOCS = ['ja', 'en', 'fr', 'ru', 'zh-CN', 'zh-TW']
ERRORS = ['workspaceRequestFailed', 'invalidServerData', 'loginRequired', 'databaseUnavailable', 'forbiddenRequest', 'emptyRequest',
  'workspaceTooLarge', 'loginAccountChanged', 'invalidWorkspace', 'workspaceSaveFailed', 'sharedListNotFound', 'invalidToken',
  'insufficientScope', 'unsupportedContentType', 'invalidJson', 'invalidQuery', 'listNotFound', 'deviceNotFound', 'invalidRecord',
  'invalidTokenRequest', 'tokenLimit', 'tokenNotFound']
DELETE = {
  'errors': ERRORS,
  'settings': ['apiTokens'],
  'wordLists': ['delete.sharedNote', 'row.share', 'row.shareLoginRequired', 'row.sharedBadge', 'legacy.currentAccount', 'legacy.toAccount', 'share'],
  'nav': ['storage.account', 'storage.accountDetail'],
  'common': ['storage.account', 'storage.accountDetail'],
  'about': ['places.current', 'places.browser.condition', 'places.account'],
  'guide': ['storage.browser.when', 'storage.account'],
  'dashboard': ['sourceAccount'],
}
SET = {
  ('nav', 'storage.browserDetail'): {
    'ja': 'このブラウザーだけに保存します。ほかの端末やブラウザーとは同期しません。',
    'en': 'Data is saved only in this browser. It does not sync with other devices or browsers.',
    'fr': 'Les données sont enregistrées uniquement dans ce navigateur, sans synchronisation avec d’autres appareils ou navigateurs.',
    'ru': 'Данные сохраняются только в этом браузере и не синхронизируются с другими устройствами и браузерами.',
    'zh-CN': '数据只保存在此浏览器中，不会与其他设备或浏览器同步。',
    'zh-TW': '資料只會儲存在此瀏覽器中，不會與其他裝置或瀏覽器同步。'},
  ('about', 'storage.text'): {
    'ja': '単語リスト・練習記録・端末は、このブラウザーだけに保存します。別の端末やブラウザーで使うときは、単語リストをCSVで書き出して読み込みます。',
    'en': 'Word lists, practice history, and devices are saved only in this browser. To use a word list in another browser or on another device, export it as CSV and import it there.',
    'fr': 'Les listes de mots, l’historique et les appareils sont enregistrés uniquement dans ce navigateur. Pour utiliser une liste ailleurs, exportez-la en CSV puis importez-la dans l’autre navigateur ou appareil.',
    'ru': 'Списки слов, история тренировок и устройства сохраняются только в этом браузере. Чтобы использовать список в другом браузере или на другом устройстве, экспортируйте его в CSV и импортируйте там.',
    'zh-CN': '单词列表、练习记录和设备只保存在此浏览器中。要在其他浏览器或设备上使用单词列表，请导出为 CSV 后在那里导入。',
    'zh-TW': '單字清單、練習紀錄與裝置只會儲存在此瀏覽器中。若要在其他瀏覽器或裝置上使用單字清單，請匯出為 CSV 後在該處匯入。'},
  ('guide', 'intro'): {
    'ja': '練習の始め方から、単語リストの作り方、記録の見方、データの保存先までをまとめています。',
    'en': 'Everything from getting started with practice to creating word lists, reading your records, and where your data is saved.',
    'fr': 'Tout ce qu’il faut savoir, des premiers pas à la création de listes de mots, en passant par la consultation des résultats et l’enregistrement des données.',
    'ru': 'Здесь собрано всё: как начать тренировку, создавать списки слов, смотреть результаты и где хранятся данные.',
    'zh-CN': '从如何开始练习，到单词列表的创建、记录的查看和数据的保存位置，这里都有说明。',
    'zh-TW': '從如何開始練習，到單字清單的建立、紀錄的查看與資料的儲存位置，都整理在這裡。'},
  ('guide', 'storage.lead'): {
    'ja': '単語リスト・練習記録・端末は、このブラウザーに保存します。',
    'en': 'Word lists, practice history, and devices are saved in this browser.',
    'fr': 'Les listes de mots, l’historique et les appareils sont enregistrés dans ce navigateur.',
    'ru': 'Списки слов, история тренировок и устройства сохраняются в этом браузере.',
    'zh-CN': '单词列表、练习记录和设备会保存在此浏览器中。',
    'zh-TW': '單字清單、練習紀錄與裝置會儲存在此瀏覽器中。'},
  ('guide', 'storage.notes.p1'): {
    'ja': '別の端末やブラウザーで使うときは、リストをCSVで書き出して、そこで読み込んでください。練習記録は含まれません。',
    'en': 'To use a list in another browser or on another device, export it as CSV and import it there. Practice history is not included.',
    'fr': 'Pour utiliser une liste dans un autre navigateur ou sur un autre appareil, exportez-la en CSV puis importez-la. L’historique d’entraînement n’est pas inclus.',
    'ru': 'Чтобы использовать список в другом браузере или на другом устройстве, экспортируйте его в CSV и импортируйте там. История тренировок не переносится.',
    'zh-CN': '要在其他浏览器或设备上使用列表，请导出为 CSV 后在那里导入。练习记录不会包含在内。',
    'zh-TW': '若要在其他瀏覽器或裝置上使用清單，請匯出為 CSV 後在該處匯入。練習紀錄不會包含在內。'},
  ('home', 'storage'): {
    'ja': '単語リスト・練習記録・端末は、このブラウザーに保存されます。別の端末やブラウザーとは同期しません。',
    'en': 'Word lists, practice history, and devices are saved in this browser. They do not sync with other devices or browsers.',
    'fr': 'Les listes de mots, l’historique et les appareils sont enregistrés dans ce navigateur, sans synchronisation avec d’autres appareils ou navigateurs.',
    'ru': 'Списки слов, история тренировок и устройства сохраняются в этом браузере и не синхронизируются с другими устройствами и браузерами.',
    'zh-CN': '单词列表、练习记录和设备会保存在此浏览器中，不会与其他设备或浏览器同步。',
    'zh-TW': '單字清單、練習紀錄與裝置會儲存在此瀏覽器中，不會與其他裝置或瀏覽器同步。'},
  ('errors', 'accountChangedReopen'): {
    'ja': '画面の状態が変わりました。画面を開き直してください。', 'en': 'This page has changed. Please reopen it.',
    'fr': 'La page a changé. Veuillez la rouvrir.', 'ru': 'Страница изменилась. Откройте её заново.',
    'zh-CN': '页面状态已更改。请重新打开页面。', 'zh-TW': '頁面狀態已變更。請重新開啟頁面。'},
  ('errors', 'accountChanged'): {
    'ja': '画面の状態が変わりました。', 'en': 'This page has changed.', 'fr': 'La page a changé.',
    'ru': 'Страница изменилась.', 'zh-CN': '页面状态已更改。', 'zh-TW': '頁面狀態已變更。'},
}
SET[('common', 'storage.guestDetail')] = SET[('nav', 'storage.browserDetail')]
# Only the end of the sentence names an account.
REPLACE = {('wordLists', 'page.description'): {
  'ja': ('別のブラウザーやアカウントで読み込めます。', '別のブラウザーや端末で読み込めます。'),
  'en': ('in another browser or account.', 'in another browser or on another device.'),
  'fr': ('dans un autre navigateur ou compte.', 'dans un autre navigateur ou sur un autre appareil.'),
  'ru': ('в другом браузере или аккаунте.', 'в другом браузере или на другом устройстве.'),
  'zh-CN': ('可在其他浏览器或账号中导入。', '可在其他浏览器或设备中导入。'),
  'zh-TW': ('可在其他瀏覽器或帳號中匯入。', '可在其他瀏覽器或裝置中匯入。')}}

def parent(d, path):
  *head, last = path.split('.')
  for p in head: d = d[p]
  return d, last

for loc in LOCS:
  base = f'src/messages/{loc}'
  for name in ['account', 'shared']: os.remove(f'{base}/{name}.json')
  files = {}
  def load(f):
    if f not in files: files[f] = json.load(open(f'{base}/{f}.json'))
    return files[f]
  for f, keys in DELETE.items():
    for k in keys:
      d, last = parent(load(f), k); del d[last]
  for (f, k), values in SET.items():
    d, last = parent(load(f), k); assert last in d, (loc, f, k); d[last] = values[loc]
  for (f, k), values in REPLACE.items():
    d, last = parent(load(f), k); old, new = values[loc]; assert old in d[last], (loc, k, d[last]); d[last] = d[last].replace(old, new)
  for f, data in files.items():
    open(f'{base}/{f}.json', 'w').write(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
print('done')
