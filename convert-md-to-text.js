class MarkdownConverter {
    constructor(options = {}) {
        this.options = {
            preserveHTML: false,
            debug: false,
            ...options,
        };

        if (this.options.debug) {
            this.debugLog = [];
        }

        this.patterns = {
            formatting: {
                comments: /<!--[\s\S]*?-->/g,
                htmlTags: /<[^>]*>/g,
                bold: /(?:\*\*|__)(.*?)(?:\*\*|__)/g,
                italic: /(?<!\\)(?:[*_])([^*_]+)(?<!\\)(?:[*_])/g,
                strikethrough: /~~(.*?)~~/g,
                inlineCode: /`([^`]+)`/g,
                subscript: /~([^~]+)~/g,
                superscript: /\^([^^]+)\^/g,
                emoji: /:([\w+-]+):/g,
            },
            blocks: {
                headers: /^(#{1,6})\s+(.*?)(?:\s*#*\s*)?$/gm,
                blockquotes: /^((?:>\s*)+)(.*)/gm,
                codeBlocks: /```(?:\w*\n)?([\s\S]*?)```|``(?:\w*\n)?([\s\S]*?)``/gm,
                indentedCode: /^(?: {4}|\t)(.*)/gm,
                horizontalRules: /^[-*_]{3,}\s*$/gm,
            },
            lists: {
                unordered: /^([\s]*)[-*+]\s+(.*)/gm,
                ordered: /^([\s]*)\d+\.\s+(.*)/gm,
                tasks: /^([\s]*)[-*+]\s+\[([ xX])\]\s+(.*)/gm,
            },
            links: {
                inline: /!?\[([^\]]*)\]\(([^)]*)\)(?:\{([^}]*)\})?/g,
                reference: /!?\[([^\]]*)\](?:\[[^\]]*\])?/g,
                definition: /^\[([^\]]+)\]:\s*([^\s]+)(?:\s+"([^"]+)")?\s*$/gm,
                footnote: /\[\^([^\]]+)\](?!:)/g,
                footnoteDefinition: /^\[\^([^\]]+)\]:\s*(.*?)$/gm,
                referenceMarker: /\[\/\/\]:\s*#\s*\([^)]+\)/g,
            },
            images: {
                inline: /!\[([^\]]*)\]\(([^)]*)\)/g,
            },
            tables: {
                row: /^\|(.+)\|$/gm,
                separator: /^\|(?:[-:]+[-| :]*)\|$/gm,
            },
            math: {
                inline: /\$([^\$]+)\$/g,
                block: /\$\$([\s\S]*?)\$\$/g,
            },
        };

        this.emojiMap = this.buildEmojiMap();
        this.entityMap = this.buildEntityMap();
    }

    convert(markdown) {
        if (this.options.debug) {
            this.debugLog = [];
            const logStep = (step, text) => {
                this.debugLog.push({ step, text });
                return text;
            };
        }

        if (!markdown) return '';
        
        const MAX_SIZE = 10 * 1024 * 1024;
        if (markdown.length > MAX_SIZE) {
            throw new Error('Input markdown exceeds maximum size limit');
        }

        let text = String(markdown);

        text = this.normalizeLineEndings(text);
        text = this.handleEscapedCharacters(text);

        text = this.processNestedStructures(text);
        text = this.processTables(text);
        text = this.processLists(text);

        if (!this.options.preserveHTML) {
            text = this.removeHTMLAndComments(text);
        }

        text = this.processFormatting(text);
        text = this.processBlocks(text);
        text = this.processLinks(text);
        text = this.processImages(text);
        text = this.processMath(text);
        text = this.cleanupText(text);

        return text;
    }

    normalizeLineEndings(text) {
        return text.replace(/\r\n|\r/g, '\n');
    }

    handleEscapedCharacters(text) {
        return text.replace(/\\([\\`*_{}\[\]()#+\-.!$])/g, '$1');
    }

    processNestedStructures(text) {
        return text.replace(this.patterns.blocks.blockquotes, (_, level, content) => {
            const depth = (level.match(/>/g) || []).length;
            return '  '.repeat(depth - 1) + content + '\n';
        });
    }

    processTables(text) {
        let lines = text.split('\n');
        let inTable = false;
        let result = [];
        
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            
            if (this.patterns.tables.separator.test(line)) {
                inTable = true;
                continue;
            }
            
            if (inTable && line.trim().startsWith('|')) {
                let cells = line.split('|')
                    .filter(cell => cell.trim())
                    .map(cell => cell.trim());
                result.push(cells.join('  '));
            } else {
                inTable = false;
                result.push(line);
            }
        }
        
        return result.join('\n');
    }

    processLists(text) {
        const listStack = [];
        return text.split('\n').map(line => {
            let indent = line.match(/^\s*/)[0].length;
            let content = line.trim();

            content = content.replace(this.patterns.lists.tasks, '$3');

            content = content.replace(this.patterns.lists.ordered, '$2')
                           .replace(this.patterns.lists.unordered, '$2');

            while (listStack.length && indent < listStack[listStack.length - 1]) {
                listStack.pop();
            }

            if (content && (content.startsWith('- ') || /^\d+\.\s/.test(content))) {
                listStack.push(indent);
                return '  '.repeat(listStack.length - 1) + content.replace(/^[-*+\d.]\s+/, '');
            }

            return line;
        }).join('\n');
    }

    removeHTMLAndComments(text) {
        return text
            .replace(this.patterns.formatting.comments, '')
            .replace(this.patterns.formatting.htmlTags, '');
    }

    processFormatting(text) {
        return text
            .replace(this.patterns.formatting.bold, '$1')
            .replace(this.patterns.formatting.italic, '$1')
            .replace(this.patterns.formatting.strikethrough, '$1')
            .replace(this.patterns.formatting.inlineCode, '$1')
            .replace(this.patterns.formatting.subscript, '$1')
            .replace(this.patterns.formatting.superscript, '$1')
            .replace(this.patterns.formatting.emoji, (_, code) => this.emojiMap[code] || code);
    }

    processBlocks(text) {
        return text
            .replace(this.patterns.blocks.headers, (_, level, content) => content + '\n\n')
            .replace(this.patterns.blocks.codeBlocks, (match, content1, content2) => {
                const content = content1 || content2 || '';
                return content.trim() + '\n\n';
            })
            .replace(this.patterns.blocks.indentedCode, '$1\n')
            .replace(this.patterns.blocks.horizontalRules, '');
    }

    processLinks(text) {
        text = text.replace(this.patterns.links.definition, '');
        text = text.replace(this.patterns.links.referenceMarker, '');
        
        text = text.replace(this.patterns.links.inline, '$1');
        text = text.replace(this.patterns.links.reference, '$1');
        
        text = text.replace(/\[([^\]]+)\]/g, '$1');
        
        return text;
    }

    processImages(text) {
        return text.replace(this.patterns.images.inline, '$1');
    }

    processMath(text) {
        return text
            .replace(this.patterns.math.block, '$1')
            .replace(this.patterns.math.inline, '$1');
    }

    cleanupText(text) {
        return text
            .replace(/&([a-zA-Z0-9]+);/g, (_, entity) => this.entityMap[entity] || entity)
            .replace(/\n{3,}/g, '\n\n')
            .replace(/^\s+|\s+$/g, '')
            .replace(/\[\/\/\]:.*/g, '')
            .replace(/\[[^\]]*\](?:\[[^\]]*\])?/g, '')
            .trim();
    }

    buildEmojiMap() {
        return {
            'smile': '😊',
            'thumbsup': '👍',
            'heart': '❤️',
        };
    }

    buildEntityMap() {
        return {
            'amp': '&',
            'lt': '<',
            'gt': '>',
            'quot': '"',
            'apos': "'",
            'copy': '©',
            'reg': '®',
            'trade': '™',
            'nbsp': ' ',
        };
    }
}


module.exports = {
    MarkdownConverter
};
