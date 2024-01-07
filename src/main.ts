import {
  App,
  BlockCache,
  Component,
  Editor,
  FuzzyMatch,
  FuzzySuggestModal,
  MarkdownRenderer,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
} from 'obsidian';
import { Highlight, getHighlights } from './api';

interface PluginSettings {
  readwiseAPIToken: string;
}

/**
 * Simplified version of the official Readwise plugin's settings; we need the API token
 * and the book IDs/titles map so that we can integrate with the highlights that have
 * already been exported to vaults.
 */
interface ReadwiseOfficialPluginSettings {
  booksIDsMap: { [key: string]: string };
  readwiseDir: string;
  token: string;
}

export interface HighlightModalEntry {
  highlightId: string;
  text: string;
  title: string;
  path: string;
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
        `![[${item.title}#^${item.highlightId}]]\n\n`,
    );

    this.highlights.remove(item);
  }

  renderSuggestion(
    match: FuzzyMatch<HighlightModalEntry>,
    el: HTMLElement,
  ): void {
    el.createEl('h2', { text: match.item.title });
    MarkdownRenderer.render(
      this.app,
      match.item.text,
      el,
      match.item.path,
      new Component(),
    );
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

  async findBlock(highlight: Highlight): Promise<{
    file: TFile;
    block: BlockCache;
    link: string;
    highlight: Highlight;
  }> {
    const file = this.findFile(highlight);

    // blocks: Record<string, BlockCache>, where keys are block IDs
    const blocks = this.app.metadataCache.getFileCache(file)?.blocks || {};
    const block = blocks[`rw${highlight.id}`];
    const link = `![[${file.basename}#^${block.id}]]`;

    return { block, file: file, link, highlight };
  }

  /**
   * Find the file in the vault that corresponds to the _book_ containing a given
   * highlight. This uses the Readwise plugin settings, which already map book titles
   * to book IDs for the usual syncing.
   */
  findFile({ bookId }: Highlight): TFile {
    const { booksIDsMap } = this.getOfficialPluginSettings();

    // Find the key/value pair where the value matches the book ID
    const bookTitle = Object.keys(booksIDsMap).find(
      (title) => booksIDsMap[title] === bookId.toString(),
    );
    if (!bookTitle) {
      throw new Error(`No book found for id ${bookId}`);
    }

    const maybeFile = this.app.vault.getAbstractFileByPath(bookTitle);
    if (maybeFile instanceof TFile) return maybeFile;

    throw new Error(`No book found for id ${bookId}`);
  }

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: 'set-readwise-token',
      name: 'Set Readwise API token',
      callback: this.getOrSetToken.bind(this),
    });

    this.addCommand({
      id: 'add-review-highlights',
      name: 'asdf Add daily review highlights to current note',
      editorCallback: async (editor: Editor) => {
        const token = await this.getOrSetToken();
        const highlights = await getHighlights(token);
        const blocks = await Promise.allSettled(
          highlights.map(this.findBlock.bind(this)),
        );

        const highlightsWithLinks = blocks.flatMap((x) =>
          x.status === 'fulfilled' ? [x.value] : [],
        );

        const modalContents = highlightsWithLinks.map((x) => ({
          highlightId: x.block.id,
          text: x.highlight.text,
          path: x.file.path,
          title: x.file.basename,
        }));
        new HighlightModal(this.app, editor, modalContents).open();
      },
    });

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
