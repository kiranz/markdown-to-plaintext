# markdown-to-plaintext
A lightweight JavaScript utility that converts Markdown text to clean plain text while preserving the content's semantic structure.

## Usage
```js
const { MarkdownConverter } = require("./convert-md-to-text.js");

// Create an instance
const converter = new MarkdownConverter({
    preserveHTML: false,
    preserveLineBreaks: true,
    debug: false
});

// Convert markdown
const markdown = "# Hello\nThis is **bold**";
const plainText = converter.convert(markdown);
```


## Supported Markdown Features

- Headers (H1-H6)
- Bold and italic text
- Strikethrough
- Lists (ordered, unordered, and task lists)
- Code blocks (fenced and indented)
- Blockquotes
- Tables
- Links and images
- Inline and block math
- Emoji shortcuts
- HTML entities
- Footnotes
- Horizontal rules

## Limitations

- Maximum input size: 10MB
- Basic emoji support (includes common emojis only)
- Basic HTML entity support

## Error Handling

The converter will throw an error if:
- The input markdown exceeds 10MB
- The input is null or undefined (returns empty string)


