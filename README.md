# Goodreads

> **Personal fork** of the Raycast Store extension from [raycast/extensions](https://github.com/raycast/extensions/tree/main/extensions/goodreads) (MIT, by puneeth and contributors).
> Change: run **Search Books** with text selected (e.g. from its hotkey) and it opens that book on Goodreads straight away. The selection is a title, optionally with the author ("Dune by Frank Herbert"); of same-titled books, the most-rated wins. A selection that isn't one title (an author, a series) opens the search prefilled instead.
> Install: `npm install && npm run dev`, then quit the dev server. It replaces the Store version and keeps its hotkey.
> Syncing upstream: copy the latest `extensions/goodreads` onto the `upstream` branch, commit, then `git merge upstream` into `main`.

Search books and authors on [Goodreads](https://www.goodreads.com/).
