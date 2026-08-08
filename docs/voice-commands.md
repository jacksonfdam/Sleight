# Voice command reference

Every phrasing below is handled by the deterministic grammar, which runs in every
browser that has speech recognition and works with the network disconnected. The
one exception is the GIF section, which calls a search service. When the built-in
language model is available it handles freer phrasing and falls back to this
grammar whenever it cannot produce a valid command.

Commands that change a property act on the current selection unless they name a
block. Every phrasing in the [Selection](#selection) table also works inside a
property or delete command: `make the second heading wider` and
`change the image's width to 300` need no selection at all. If no block is named
and nothing is selected, the command is ignored.

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

A block name can be inserted into any of these: `make the hero wider`,
`change the second heading's font size to 40`, `make the intro copy text
smaller`. The property is read from the end of the phrase and whatever precedes
it is the target, so `text colour` stays a property while `the text block's
colour` names a block.

## Rotation

The verb can be `rotate`, `tilt`, `spin`, or `turn`. `turn` also belongs to the
property grammar, so it only counts as a rotation when the phrase carries a
number or a rotation word — `turn the colour to red` is still a colour change.

| Say                                | Effect                     |
| ---------------------------------- | -------------------------- |
| `rotate it`                        | Turns by 15 degrees        |
| `rotate it 30 degrees`             | Turns by that many degrees |
| `rotate the image to 90 degrees`   | Turns to that angle        |
| `rotate the image left 45 degrees` | Turns anticlockwise        |
| `straighten it` / `unrotate it`    | Returns the block to level |

The angle wraps rather than stopping: nudging past 360 carries on from zero, and
a negative angle reads as its positive equivalent.

## Text styles

Bold, italic, and underline apply to the whole block. They combine freely, and
each is switched independently of the others.

| Say                                   | Effect                 |
| ------------------------------------- | ---------------------- |
| `bold it` / `make it bold`            | Switches bold on       |
| `italicise it` / `make it italic`     | Switches italic on     |
| `underline it` / `make it underlined` | Switches underline on  |
| `unbold it` / `make it not bold`      | Switches bold off      |
| `remove the underline`                | Switches underline off |
| `remove the italics from the intro`   | Switches it off there  |

`remove the underline` is checked before the delete rule, so a style word after
`remove` is always about the style. A block would have to be labelled Underline
for that to be ambiguous, and even then the style wins.

## Resizing by a multiple

Separate from the step commands above: these multiply the current size rather
than adding a fixed number of pixels. The box scales about its centre, so a
block grows in place rather than towards the bottom right.

| Say                               | Effect                                |
| --------------------------------- | ------------------------------------- |
| `double the size` / `double it`   | Twice as large                        |
| `triple the size`                 | Three times as large                  |
| `halve it` / `half the size`      | Half as large                         |
| `increase the size by 50 percent` | 1.5× — `by` is a step                 |
| `reduce the size by 25%`          | 0.75×                                 |
| `make it 150 percent`             | 1.5× — a bare figure is a destination |

Naming the type scales the type instead, leaving the box alone:

| Say                                    | Effect              |
| -------------------------------------- | ------------------- |
| `double the font size`                 | Twice the type size |
| `triple the text size`                 | Three times         |
| `increase the font size by 50 percent` | 1.5× the type size  |
| `halve the type size`                  | Half the type size  |

`by` and `to` mean different things. `by 50 percent` is a step from where the
block is now; `to 150 percent` and a bare `150 percent` are a destination.

## Centring on the canvas

This is a position, not a text alignment, and the two share a verb. An axis has
to be named — without one the phrase still means the text.

| Say                                     | Effect                   |
| --------------------------------------- | ------------------------ |
| `center it horizontally`                | Centres left to right    |
| `centre it vertically`                  | Centres top to bottom    |
| `center it on the canvas`               | Both axes                |
| `center it horizontally and vertically` | Both axes                |
| `center the image vertically`           | Centres the named block  |
| `center it`                             | Still centres the _text_ |

## Alignment

| Say                             | Effect                  |
| ------------------------------- | ----------------------- |
| `align left`                    | Left aligns the text    |
| `align center` / `align centre` | Centres the text        |
| `align right`                   | Right aligns the text   |
| `center it`                     | Centres the text        |
| `align the image to the right`  | Aligns the named block  |
| `centre the hero`               | Centres the named block |

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
image. `block` and `element` match any type, so `the third element` counts
across the whole canvas. A plural is accepted wherever a singular is, and a
possessive names the same block as the plain form.

## Deleting a block

| Say                         | Effect                          |
| --------------------------- | ------------------------------- |
| `delete` / `delete it`      | Deletes the current selection   |
| `remove this`               | Same                            |
| `delete the image`          | Deletes the block that is named |
| `get rid of the last block` | Any target phrasing works here  |

The canvas itself is not in the target vocabulary, so no phrasing reaches it.
A deletion is an ordinary transaction: `undo` brings the block back with its
properties intact. The toolbar's Delete button and the `Delete` and `Backspace`
keys do the same thing, and all three appear in the history panel tagged with
the source they came from.

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
cascades from the top corner.

`block` and `element` name no type on their own, so `add a block` is refused
rather than guessed at, while `add a heading block` is the same as
`add a heading`.

## Filling an image with a GIF

The only commands that reach a network service. They need `VITE_GIPHY_KEY` to be
set; without it the status bar says so and nothing changes. The same four actions
are in the inspector whenever an image block is selected, which is the way to
tell a failing search apart from a misheard word.

| Say                          | Effect                                    |
| ---------------------------- | ----------------------------------------- |
| `find a gif of a cat`        | Searches and shows the first result       |
| `search gifs for explosions` | Same                                      |
| `a gif of heavy rain`        | Same, without a verb                      |
| `change it` / `another one`  | The next result for the same search       |
| `next gif` / `try another`   | Same                                      |
| `randomize` / `surprise me`  | Any other result for the same search      |
| `keep it` / `that one`       | Ends the browse and keeps what is showing |

The GIF lands in the selected block when that block is an image, and in the
first image block on the canvas otherwise. Each change is its own undo step, so
`undo` walks back through the results one at a time.

`gif` is a short word with nothing around it to disambiguate, and recognisers
routinely return `gift`, `jif`, or `jiffy` instead. All of those are accepted
wherever `gif` is, so `find a gift for a cat` does the same thing as
`find a gif of a cat`. `of`, `for`, `about`, `with`, and `showing` are all
accepted as the word before the query.

`change it` and the other browse words only mean anything while a search is
open. Before a search, and after `keep it`, they fall back to the ordinary
grammar — which is what stops `change the colour to red` being read as a request
for a different GIF.

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

## Which parser is running

The badge in the toolbar names the tier, and the console states the whole
configuration once at start-up:

```
[sleight] voice · tier=grammar · parser=the deterministic grammar only ·
          model=unavailable · language=en · speech=available
```

`model=unavailable` means the browser has no built-in language model running, so
every phrasing has to come from the tables above. `model=available` with
`tier=full` means freer phrasing is accepted and these tables are the fallback.
While the badge reads `Starting`, the answer has not arrived yet and the
microphone is held disabled; everything else in the editor already works.

## When nothing happens

Silence is the one failure voice can produce, and two places report it. The
status bar shows the last thing the microphone heard, struck through when no
command came out of it. The history panel keeps those lines, so a phrase that was
misheard can be read back word for word.

That distinction matters more than it sounds: `find a jif of a cat` is not in the
vocabulary and `find a gif of a cat` is, and without seeing the transcript the two
are the same silence. Saying a command again works — an identical phrase is only
suppressed for about a second, long enough to swallow the recogniser's own
duplicate and no longer.
