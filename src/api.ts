interface ReadwiseReview {
  review_id: number;
  review_url: string;
  review_completed: boolean;
  highlights: Highlight[];
}

interface Highlight {
  id: number;
  text: string;
  title: string;
  author: string;
}

export interface HighlightDetail extends Highlight {
  bookId: number;
}

export interface HighlightModalEntry {
  highlightId: string;
  text: string;
  title: string;
  // author: string;
}

function getAuthHeaders(token: string) {
  return { AUTHORIZATION: `Token ${token}` };
}

async function getDailyReview(token: string): Promise<ReadwiseReview> {
  const response = await fetch('https://readwise.io/api/v2/review/', {
    method: 'GET',
    headers: getAuthHeaders(token),
  });
  const review: ReadwiseReview = await response.json();
  return review;
}

async function getHighlightBookId(
  highlight: Highlight,
  token: string,
): Promise<{ bookId: number }> {
  const response = await fetch(
    `https://readwise.io/api/v2/highlights/${highlight.id}`,
    {
      method: 'GET',
      headers: getAuthHeaders(token),
    },
  );
  const highlightDetail = await response.json();
  return { bookId: highlightDetail.book_id };
}

export async function getHighlights(token: string): Promise<HighlightDetail[]> {
  const review = await getDailyReview(token);

  const highlightDetails = await Promise.all(
    review.highlights.map(async (highlight) => ({
      ...highlight,
      bookId: (await getHighlightBookId(highlight, token)).bookId,
    })),
  );
  return highlightDetails;
}

// async function findBlock(highlight: HighlightDetail): Promise<{
//   file: TFile;
//   block: BlockCache;
//   link: string;
//   highlight: HighlightDetail;
// }> {
//   const bookIdsMap = getOfficialPluginSettings().booksIDsMap;

//   // Find the key/value pair where the value is the highlight.id
//   const bookTitle = Object.keys(bookIdsMap).find(
//     (title) => bookIdsMap[title] === highlight.bookId.toString(),
//   );
//   if (!bookTitle) throw new Error(`No book found for id ${highlight.bookId}`);

//   const maybeFile = this.app.vault.getAbstractFileByPath(bookTitle);
//   if (!(maybeFile instanceof TFile))
//     throw new Error(`No book found for id ${highlight.bookId}`);

//   // blocks: Record<string, BlockCache>, where keys are block IDs
//   const blocks = this.app.metadataCache.getFileCache(maybeFile)?.blocks || {};
//   const block = blocks[this.getBlockId(highlight)];

//   const link = `![[${maybeFile.basename}#^${block.id}]]`;

//   return { block, file: maybeFile, link, highlight };
// }

// const editorCallback = async (editor: Editor) => {
//   // await this.getTokenFromOfficialPlugin();
//   const review: ReadwiseReview = await getDailyReview();
//   const highlightDetails = await Promise.all(
//     review.highlights.map(async (highlight) => ({
//       ...highlight,
//       bookId: (await getHighlightBookId(highlight)).bookId,
//     })),
//   );
//   const blocks = await Promise.allSettled(
//     highlightDetails.map(
//       async (highlight) => await findBlock(highlight),
//     ),
//   );

//   const highlightsWithLinks = blocks.flatMap((x) =>
//     x.status === 'fulfilled' ? [x.value] : [],
//   );

//   const modalContents = highlightsWithLinks.map((x) => ({
//     highlightId: x.block.id,
//     text: x.highlight.text,
//     title: x.file.basename,
//   }));
//   return modalContents;
// };
