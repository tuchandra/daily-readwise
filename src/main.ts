import {
  App,
  BlockCache,
  Editor,
  FuzzyMatch,
  FuzzySuggestModal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
} from 'obsidian';
import { HighlightDetail, getHighlights } from './api';

interface PluginSettings {
  readwiseAPIToken: string;
}

/**
 * Simplified version of the official Readwise plugin's settings; we need the API token
 * and the book IDs/titles map so that we can integrate with the existing exports.
 */
interface ReadwiseOfficialPluginSettings {
  booksIDsMap: { [key: string]: string };
  token: string;
}

export interface HighlightModalEntry {
  highlightId: string;
  text: string;
  title: string;
  // author: string;
}

export class HighlightModal extends FuzzySuggestModal<HighlightModalEntry> {
  editor: Editor;
  highlights: HighlightModalEntry[];

  constructor(app: App, editor: Editor, highlights: HighlightModalEntry[]) {
    super(app);
    this.editor = editor;
    this.highlights = highlights;
  }

  getItems(): HighlightModalEntry[] {
    return this.highlights;
  }

  getItemText(item: HighlightModalEntry): string {
    return item.text;
  }

  onChooseItem(item: HighlightModalEntry) {
    new Notice(`Selected ${item.title}`);

    this.editor.replaceSelection(
      `Highlight from [[${item.title}]]\n\n` +
        `![[${item.title}#^${item.highlightId}]]\n`,
    );

    this.highlights.remove(item);
  }

  renderSuggestion(
    match: FuzzyMatch<HighlightModalEntry>,
    el: HTMLElement,
  ): void {
    el.createEl('h2', { text: match.item.title });
    el.createEl('div', { text: match.item.text });
  }
}

export default class DailyHighlightsPlugin extends Plugin {
  settings: PluginSettings = { readwiseAPIToken: '' };

  getOfficialPluginSettings(): ReadwiseOfficialPluginSettings {
    // @ts-ignore; property 'plugins' is undocumented
    const plugins = this.app.plugins;
    const settings = plugins.plugins['readwise-official'].settings;
    return settings;
  }

  getToken(): string {
    if (!this.settings.readwiseAPIToken)
      new Notice('No API token found for Readwise');

    return this.settings.readwiseAPIToken;
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
  async getOrSetToken(): Promise<string> {
    if (this.settings.readwiseAPIToken) return this.settings.readwiseAPIToken;

    const token = this.getOfficialPluginSettings().token;
    this.settings.readwiseAPIToken = token;

    await this.saveSettings();
    new Notice('Successfully set Readwise API token');
    return token;
  }

  getBlockId({ id: highlightId }: HighlightDetail): string {
    return `rw${highlightId}`;
  }

  async findBlock(highlight: HighlightDetail): Promise<{
    file: TFile;
    block: BlockCache;
    link: string;
    highlight: HighlightDetail;
  }> {
    const bookIdsMap = this.getOfficialPluginSettings().booksIDsMap;

    // Find the key/value pair where the value is the highlight.id
    const bookTitle = Object.keys(bookIdsMap).find(
      (title) => bookIdsMap[title] === highlight.bookId.toString(),
    );
    if (!bookTitle) throw new Error(`No book found for id ${highlight.bookId}`);

    const maybeFile = this.app.vault.getAbstractFileByPath(bookTitle);
    if (!(maybeFile instanceof TFile))
      throw new Error(`No book found for id ${highlight.bookId}`);

    // blocks: Record<string, BlockCache>, where keys are block IDs
    const blocks = this.app.metadataCache.getFileCache(maybeFile)?.blocks || {};
    const block = blocks[this.getBlockId(highlight)];

    const link = `![[${maybeFile.basename}#^${block.id}]]`;

    return { block, file: maybeFile, link, highlight };
  }

  async onload() {
    await this.loadSettings();

    this.addRibbonIcon(
      'highlighter',
      'Set Readwise API token',
      this.getOrSetToken.bind(this),
    );

    // This adds a simple command
    this.addCommand({
      id: 'add-review-highlights',
      name: 'asdf Add daily review highlights to current note',
      editorCallback: async (editor) => {
        const token = await this.getOrSetToken();
        const highlightDetails = await getHighlights(token);
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
      callback: this.getOrSetToken.bind(this),
    });

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new SettingTab(this.app, this));
  }

  onunload(): void {}

  async loadSettings() {}

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class SettingTab extends PluginSettingTab {
  plugin: DailyHighlightsPlugin;

  constructor(app: App, plugin: DailyHighlightsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName('Readwise API token')
      .setDesc(
        'API token from readwise.io. (Requires active Readwise subscription.)',
      )
      .addText((text) =>
        text
          .setPlaceholder('n/a')
          .setValue(this.plugin.getToken())
          .onChange(async (value) => {
            this.plugin.settings.readwiseAPIToken = value;
            await this.plugin.saveSettings();
          }),
      );
  }
}
