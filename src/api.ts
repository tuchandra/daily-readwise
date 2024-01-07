interface ReadwiseReview {
  review_id: number;
  review_url: string;
  review_completed: boolean;
  highlights: ReviewHighlight[];
}

interface ReviewHighlight {
  id: number;
  text: string;
  title: string;
  author: string;
}

export interface Highlight extends ReviewHighlight {
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
  highlight: ReviewHighlight,
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

/**
 * Fetch your Readwise daily review, then (for each highlight) augment the
 * review with the book ID.
 */
export async function getHighlights(token: string): Promise<Highlight[]> {
  const review = await getDailyReview(token);

  const highlightDetails = await Promise.all(
    review.highlights.map(async (highlight) => ({
      ...highlight,
      bookId: (await getHighlightBookId(highlight, token)).bookId,
    })),
  );
  return highlightDetails;
}
