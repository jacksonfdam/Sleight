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

| Say                  | Effect                       |
| -------------------- | ---------------------------- |
| `select the hero`    | Selects the first hero block |
| `select the section` | Selects the first section    |
| `select the text`    | Selects the first text block |
| `select the image`   | Selects the first image      |
| `deselect`           | Clears the selection         |

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
