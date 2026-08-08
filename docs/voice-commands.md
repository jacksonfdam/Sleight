# Voice command reference

Every phrasing below is handled by the deterministic grammar, which runs in every
browser that has speech recognition and works with the network disconnected. When
the built-in language model is available it handles freer phrasing and falls back
to this grammar whenever it cannot produce a valid command.

Commands that change a property act on the current selection. If nothing is
selected they are ignored.

## Colour

| Say                             | Effect                                     |
| ------------------------------- | ------------------------------------------ |
| `change the text color to teal` | Sets the text colour                       |
| `change the colour to navy`     | Same, British spelling accepted            |
| `set the color to #ff8800`      | Accepts a hex literal, three or six digits |

Recognised colour names: black, white, grey, gray, silver, slate, navy, blue,
sky, cyan, teal, emerald, green, lime, olive, yellow, amber, gold, orange,
coral, red, maroon, crimson, pink, rose, magenta, purple, violet, indigo, brown.
Anything else is ignored rather than guessed at.

## Size

| Say                                              | Effect                         |
| ------------------------------------------------ | ------------------------------ |
| `change the font size to 32`                     | Sets type size in pixels       |
| `set the width to 500`                           | Sets width in pixels           |
| `set the height to 240`                          | Sets height in pixels          |
| `make it bigger` / `make it wider`               | Widens the block               |
| `make it smaller` / `make it narrower`           | Narrows the block              |
| `make it taller`                                 | Increases height               |
| `make it shorter`                                | Reduces height                 |
| `make the text bigger` / `make the text smaller` | Changes type size, not the box |

Units are optional: `32`, `32 pixels`, and `32px` are equivalent.

## Alignment

| Say                             | Effect                |
| ------------------------------- | --------------------- |
| `align left`                    | Left aligns the text  |
| `align center` / `align centre` | Centres the text      |
| `align right`                   | Right aligns the text |
| `center it`                     | Centres the text      |

## Selection

The verb can be `select`, `pick`, `choose`, `highlight`, `focus on`, or `go to`.
What follows it is resolved in a fixed order: a pronoun, then a position, then a
type with an optional ordinal, and only then the block's own label.

| Say                         | Effect                                     |
| --------------------------- | ------------------------------------------ |
| `select the hero`           | Selects the first hero block               |
| `select the image`          | Selects the first image                    |
| `select the heading`        | Selects the first block of any level       |
| `select the second h2`      | Counts blocks of that type in canvas order |
| `select the last paragraph` | Takes the final one instead of the first   |
| `select the first block`    | Selects the first block on the canvas      |
| `select the next block`     | Moves forward, wrapping at the end         |
| `select the previous block` | Moves back, wrapping at the start          |
| `select intro copy`         | Matches the block's label                  |
| `deselect`                  | Clears the selection                       |

Type names accept synonyms: `banner` for a hero, `title` for an `h1`, `subtitle`
for an `h2`, `copy` or `body` for a paragraph, and `picture` or `photo` for an
image. A plural is accepted wherever a singular is.

## Adding a block

The verb can be `add`, `insert`, `create`, `place`, `put`, or `new`. Unlike a
property command, this one works with nothing selected, and the new block is
selected once it lands.

| Say                | Effect                     |
| ------------------ | -------------------------- |
| `add a heading`    | Inserts an `h1`            |
| `add an h3`        | Inserts that heading level |
| `add a subtitle`   | Inserts an `h2`            |
| `add a paragraph`  | Inserts a paragraph        |
| `insert a picture` | Inserts an image block     |
| `new section`      | Inserts a section          |

A block is stacked under the lowest one that shares its column. When the column
is full the next one is used, and when the canvas has no room left the block
cascades from the top corner. There is no spoken command for deleting a block;
`undo` is the way back.

## History

| Say    | Effect                                |
| ------ | ------------------------------------- |
| `undo` | Undoes the last transaction           |
| `redo` | Reapplies the last undone transaction |

## Content

| Say                                               | Effect                         |
| ------------------------------------------------- | ------------------------------ |
| `change the text to Welcome aboard`               | Replaces the block's text      |
| `set the source to https://example.com/photo.jpg` | Points an image block at a URL |

## What is ignored

Filler openings (`please`, `okay`, `hey`, `now`) and trailing punctuation are
stripped before parsing. Anything that does not match a pattern above produces no
command at all rather than a guess, so ordinary conversation near an open
microphone does not edit the document.
