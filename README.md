# markdown-to-plaintext
Converts Markdown to Plain text

## Usage
```js
function markdownToPlainText(markdown, options = {}) {
    const converter = new MarkdownConverter(options);
    return converter.convert(markdown);
}
```
