import React, { useEffect, useState } from "react";
import {
  Action,
  ActionPanel,
  Icon,
  List,
  Keyboard,
  PopToRootType,
  closeMainWindow,
  getPreferenceValues,
  getSelectedText,
  open,
} from "@raycast/api";
import { useCachedPromise, usePromise } from "@raycast/utils";
import { fetchBooksByTitle, getDetailsPageUrl } from "./goodreads-api";
import type { Book } from "./types";
import BookDetails from "./book-details";
import { STRINGS } from "./strings";
import { useRecentlyViewedBooks } from "./useRecentlyViewedBooks";
import { guessNamedBook, typesafeKey } from "./jev";

/** Jev's guess at the book a selection names (see guessNamedBook), with this extension's key. */
const guessSelectedBook = (books: Book[], selection: string) =>
  guessNamedBook(books, selection, typesafeKey(getPreferenceValues<Preferences>().typesafeApiKey));

interface SearchBooksPageProps {
  arguments: {
    title: string;
  };
}

export default function SearchBooksPage(props: SearchBooksPageProps) {
  const [searchQuery, setSearch] = useState(props.arguments.title);
  // Launched without a title: search the text selected in the frontmost app, and go straight to the book it
  // names. Undefined until read, "" when nothing is selected.
  const [selection, setSelection] = useState(props.arguments.title ? "" : undefined);
  useEffect(() => {
    if (selection !== undefined) return;
    getSelectedText()
      .catch(() => "")
      .then((text) => {
        const trimmed = text.replace(/\s+/g, " ").trim();
        setSelection(trimmed);
        setSearch(trimmed);
      });
  }, []);
  const trimmedQuery = searchQuery?.trim();
  const { data, isLoading } = useCachedPromise(fetchBooksByTitle, [trimmedQuery], {
    execute: trimmedQuery?.length > 0,
    keepPreviousData: true,
  });
  const { recentlyViewedBooks, addRecentView, clearAllRecentViews, clearRecentlyViewedBook } = useRecentlyViewedBooks();

  const results = data?.data;
  const onSelection = !!selection && selection === trimmedQuery;
  const titleMatch = onSelection ? findNamedBook(results ?? [], selection) : undefined;
  // No title matches the selection outright: Jev picks the result it names while the results show, loading. A sure
  // pick opens like a title match, unless the user has moved in the list meanwhile; a clear lead is preselected.
  const [moved, setMoved] = useState(false);
  const { data: guess, isLoading: isGuessing } = usePromise(guessSelectedBook, [results ?? [], selection ?? ""], {
    execute: onSelection && !titleMatch && !!results?.length,
  });
  const guessed = onSelection && !titleMatch && !moved && guess && results?.includes(guess.book) ? guess : undefined;
  const namedBook = titleMatch ?? (guessed?.sure ? guessed.book : undefined);
  const namedBookUrl = namedBook && getDetailsPageUrl(namedBook.contentUrl.detailsPage);
  useEffect(() => {
    if (namedBookUrl) open(namedBookUrl).then(() => closeMainWindow({ popToRootType: PopToRootType.Immediate }));
  }, [namedBookUrl]);

  if (selection === undefined)
    return (
      <List
        isLoading
        searchText=""
        onSearchTextChange={setSearch}
        searchBarPlaceholder={STRINGS.searchBooksPlaceholder}
      />
    );

  const mode = trimmedQuery?.length > 0 ? "search" : "recent";
  let books = data?.data;
  let sectionTitle = STRINGS.searchResults;

  // If searchQuery is empty, show recently viewed books as ZeroQuery suggestions
  if (mode === "recent") {
    books = recentlyViewedBooks;
    sectionTitle = STRINGS.recentBooks;
  }

  return (
    <List
      isLoading={isLoading || isGuessing}
      searchText={searchQuery}
      throttle
      searchBarPlaceholder={STRINGS.searchBooksPlaceholder}
      onSearchTextChange={setSearch}
      selectedItemId={guessed?.book.id}
      onSelectionChange={(id) => {
        if (id && id !== results?.[0]?.id && id !== guessed?.book.id) setMoved(true);
      }}
    >
      <List.Section title={sectionTitle}>
        {books?.map((book) => (
          <BookItem
            key={book.id}
            book={book}
            onBookClick={addRecentView}
            onRemoveFromRecent={clearRecentlyViewedBook}
            onClearAllRecent={clearAllRecentViews}
            mode={mode}
          />
        ))}
      </List.Section>
    </List>
  );
}

/** Lowercased words without accents or punctuation, so "“Shōgun”" and "shogun" compare equal. */
const words = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [];

/**
 * The book a selection names: one whose title, with or without its subtitle, is the selected text, give or take
 * the author ("Dune by Frank Herbert", "Stoner – John Williams"). Of same-titled books, the most-rated.
 */
function findNamedBook(books: Book[], selection: string): Book | undefined {
  const named = books.filter((book) => {
    const authorWords = new Set(["by", ...words(book.author)]);
    const key = (text: string) =>
      words(text)
        .filter((word) => !authorWords.has(word))
        .join(" ");
    const title = book.title.replace(/\s*\([^()]*\)$/, ""); // drop the series, e.g. "Dune (Dune, #1)"
    return [title, title.split(":")[0]].some((name) => key(name) === key(selection));
  });
  return named.sort((a, b) => (b.ratingsCount ?? 0) - (a.ratingsCount ?? 0))[0];
}

interface BookItemProps {
  book: Book;
  mode: "search" | "recent";
  onBookClick: (book: Book) => void;
  onRemoveFromRecent: (bookId: string) => void;
  onClearAllRecent: () => void;
}

function BookItem(props: BookItemProps) {
  const { book, onBookClick, onRemoveFromRecent, onClearAllRecent, mode } = props;
  const { author, title, thumbnail, contentUrl, rating } = book;
  const detailsPageUrl = getDetailsPageUrl(contentUrl.detailsPage);

  const isRecentMode = mode === "recent";

  return (
    <List.Item
      id={book.id}
      title={title}
      subtitle={author}
      accessories={[{ text: `${rating} ⭐️` }]}
      icon={thumbnail ? { source: thumbnail } : Icon.Book}
      actions={
        <ActionPanel>
          <>
            <Action.Push
              icon={Icon.Window}
              title={STRINGS.showDetails}
              target={<BookDetails bookTitle={title} qualifier={contentUrl.detailsPage} />}
              onPush={() => onBookClick(book)}
            />
            <Action.OpenInBrowser url={detailsPageUrl} />
          </>

          <ActionPanel.Section>
            <Action.CopyToClipboard shortcut={Keyboard.Shortcut.Common.Pin} title={STRINGS.copyTitle} content={title} />
            <Action.CopyToClipboard
              shortcut={Keyboard.Shortcut.Common.CopyPath}
              title={STRINGS.copyUrl}
              content={detailsPageUrl}
            />
          </ActionPanel.Section>

          {isRecentMode && (
            <ActionPanel.Section>
              <Action
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                title={STRINGS.removeFromRecent}
                onAction={() => onRemoveFromRecent(book.id)}
              />
              <Action
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                title={STRINGS.clearAllRecent}
                onAction={onClearAllRecent}
              />
            </ActionPanel.Section>
          )}
        </ActionPanel>
      }
    />
  );
}
