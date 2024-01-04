'use strict';
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) =>
  key in obj
    ? __defProp(obj, key, {
        enumerable: true,
        configurable: true,
        writable: true,
        value,
      })
    : (obj[key] = value);
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== 'symbol' ? key + '' : key, value);
  return value;
};
Object.defineProperties(exports, {
  __esModule: { value: true },
  [Symbol.toStringTag]: { value: 'Module' },
});
const obsidian = require('obsidian');
class HighlightModal extends obsidian.FuzzySuggestModal {
  constructor(app, editor, highlights) {
    super(app);
    __publicField(this, 'editor');
    __publicField(this, 'highlights');
    this.editor = editor;
    this.highlights = highlights;
  }
  getItems() {
    return this.highlights;
  }
  getItemText(item) {
    return item.text;
  }
  onChooseItem(item) {
    new obsidian.Notice(`Selected ${item.title}`);
    this.editor.replaceSelection(
      `Highlight from [[${item.title}]]

![[${item.title}#^${item.highlightId}]]
`,
    );
    this.highlights.remove(item);
  }
  renderSuggestion(match, el) {
    el.createEl('h2', { text: match.item.title });
    el.createEl('div', { text: match.item.text });
  }
}
class DailyHighlightsPlugin extends obsidian.Plugin {
  constructor() {
    super(...arguments);
    __publicField(this, 'settings', {});
  }
  getAuthHeaders() {
    return {
      AUTHORIZATION: `Token ${this.settings.readwiseAPIToken}`,
    };
  }
  getOfficialPluginSettings() {
    const plugins = this.app.plugins;
    const settings = plugins.plugins['readwise-official'].settings;
    return settings;
  }
  getBlockId({ id: highlightId }) {
    return `rw${highlightId}`;
  }
  /**
   * If there's no token set, add a command to read it from the _official_ Readwise plugin settings.
   * (Assume that it's installed and enabled, I suppose.)
   *
   * Accessing the data from another plugin is questionable. I don't think it's explicitly
   * forbidden, but I also don't think it's intended. (The type definition for `this.app`
   * does not include `plugins`, so it's at minimum undocumented.)
   *
   * This is primarily for my own use, and it's gated behind a command the user has to choose,
   * though, so I'm not too worried about it.
   */
  async getTokenFromOfficialPlugin() {
    const apiToken = this.getOfficialPluginSettings().token;
    this.settings.readwiseAPIToken = apiToken;
    await this.saveSettings();
    new obsidian.Notice('Successfully set Readwise API token');
  }
  async getDailyReview() {
    const response = await fetch(`https://readwise.io/api/v2/review/`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });
    const review = await response.json();
    return review;
  }
  async getHighlightBookId(highlight) {
    const response = await fetch(
      `https://readwise.io/api/v2/highlights/${highlight.id}`,
      {
        method: 'GET',
        headers: this.getAuthHeaders(),
      },
    );
    const highlightDetail = await response.json();
    return { bookId: highlightDetail.book_id };
  }
  async findBlock(highlight) {
    var _a;
    const bookIdsMap = this.getOfficialPluginSettings().booksIDsMap;
    const bookTitle = Object.keys(bookIdsMap).find(
      (title) => bookIdsMap[title] === highlight.bookId.toString(),
    );
    if (!bookTitle) throw new Error(`No book found for id ${highlight.bookId}`);
    const maybeFile = this.app.vault.getAbstractFileByPath(bookTitle);
    if (!(maybeFile instanceof obsidian.TFile))
      throw new Error(`No book found for id ${highlight.bookId}`);
    const blocks =
      ((_a = this.app.metadataCache.getFileCache(maybeFile)) == null
        ? void 0
        : _a.blocks) || {};
    const block = blocks[this.getBlockId(highlight)];
    const link = `![[${maybeFile.basename}#^${block.id}]]`;
    return { block, file: maybeFile, link, highlight };
  }
  async onload() {
    await this.loadSettings();
    this.addRibbonIcon(
      'book-open',
      'Review highlights',
      this.getTokenFromOfficialPlugin.bind(this),
    );
    this.addCommand({
      id: 'add-review-highlights',
      name: 'asdf Add daily review highlights to current note',
      editorCallback: async (editor) => {
        await this.getTokenFromOfficialPlugin();
        const review = await this.getDailyReview();
        const highlightDetails = await Promise.all(
          review.highlights.map(async (highlight) => ({
            ...highlight,
            bookId: (await this.getHighlightBookId(highlight)).bookId,
          })),
        );
        const blocks = await Promise.allSettled(
          highlightDetails.map(
            async (highlight) => await this.findBlock(highlight),
          ),
        );
        const highlightsWithLinks = blocks.flatMap((x) =>
          x.status === 'fulfilled' ? [x.value] : [],
        );
        const modalContents = highlightsWithLinks.map((x) => ({
          highlightId: x.block.id,
          text: x.highlight.text,
          title: x.file.basename,
        }));
        new HighlightModal(this.app, editor, modalContents).open();
      },
    });
    this.addCommand({
      id: 'find-readwise-token',
      name: 'Set the Readwise API token from the official plugin settings',
      callback: this.getTokenFromOfficialPlugin.bind(this),
    });
    this.addCommand({
      id: 'find-readwise-token',
      name: 'Set the Readwise API token from the official plugin settings',
      callback: this.getTokenFromOfficialPlugin.bind(this),
    });
    this.addSettingTab(new SettingTab(this.app, this));
    this.registerDomEvent(document, 'click', (evt) => {
      console.log('click', evt);
    });
    this.registerInterval(
      window.setInterval(() => console.log('setInterval'), 5 * 60 * 1e3),
    );
  }
  onunload() {}
  async loadSettings() {}
  async saveSettings() {
    await this.saveData(this.settings);
  }
}
class SettingTab extends obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    __publicField(this, 'plugin');
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new obsidian.Setting(containerEl)
      .setName('Readwise API token')
      .setDesc(
        'API token from readwise.io. (Requires active Readwise subscription.)',
      )
      .addText((text) =>
        text
          .setPlaceholder('n/a')
          .setValue(this.plugin.settings.readwiseAPIToken)
          .onChange(async (value) => {
            this.plugin.settings.readwiseAPIToken = value;
            await this.plugin.saveSettings();
          }),
      );
  }
}
exports.HighlightModal = HighlightModal;
exports.default = DailyHighlightsPlugin;
