class MarkdownConverter {
    constructor(options = {}) {
        this.options = {
            preserveHTML: false,
            debug: false,
            preserveLineBreaks: true,
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
                highlighter: /==([^=]+)==/g,
                checkbox: /\[([xX ])\]/g,
                definition: /^\s*\[(.+?)\]:\s*(.+?)(?:\s+"(.+?)")?\s*$/gm,
            },
            blocks: {
                headers: /^(#{1,6})\s+(.*?)(?:\s*#*\s*)?$/gm,
                blockquotes: /^((?:>\s*)+)(.*)/gm,
                codeBlocks: /```(?:\w*\n)?([\s\S]*?)```|``(?:\w*\n)?([\s\S]*?)``|`(?:\w*\n)?([\s\S]*?)`/gm,
                indentedCode: /^(?:(?:    |\t).*(?:\n|$))+/gm,
                horizontalRules: /^(?:[-*_]){3,}\s*$/gm,
                yaml: /^---\n[\s\S]*?\n---/m,
            },
            lists: {
                unordered: /^([\s]*)[-*+]\s+(.*)/gm,
                ordered: /^([\s]*)(?:\d+[.)]\s|\[(?:\d+|[a-zA-Z])\]|\(?(?:\d+|[a-zA-Z])\))\s+(.*)/gm,
                tasks: /^([\s]*)[-*+]\s+\[([ xX])\]\s+(.*)/gm,
                definition: /^([\s]*)(.*?)\n:\s+(.*)/gm,
            },
            links: {
                inline: /!?\[([^\]]*)\]\(([^)]*)\)(?:\{([^}]*)\})?/g,
                reference: /!?\[([^\]]*)\](?:\[[^\]]*\])?/g,
                definition: /^\[([^\]]+)\]:\s*([^\s]+)(?:\s+"([^"]+)")?\s*$/gm,
                footnote: /\[\^([^\]]+)\](?!:)/g,
                footnoteDefinition: /^\[\^([^\]]+)\]:\s*(.*?)$/gm,
                referenceMarker: /\[\/\/\]:\s*#\s*\([^)]+\)/g,
                autolink: /<([^>]+)>/g,
            },
            images: {
                inline: /!\[([^\]]*)\]\(([^)]*)\)/g,
                reference: /!\[([^\]]*)\]\[([^\]]*)\]/g,
            },
            tables: {
                row: /^\|(.+)\|$/gm,
                separator: /^\|(?:[-:]+[-| :]*)\|$/gm,
                cell: /\|(?:[^|]*\|)+/g,
            },
            math: {
                inline: /\$([^\$]+)\$/g,
                block: /\$\$([\s\S]*?)\$\$/g,
                latex: /\\[\(\[]([\s\S]*?)\\[\)\]]/g,
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
        
        const MAX_SIZE = 10 * 1024 * 1024; // 10MB limit
        if (markdown.length > MAX_SIZE) {
            throw new Error('Input markdown exceeds maximum size limit');
        }

        let text = String(markdown);

        // Pre-processing
        text = this.normalizeLineEndings(text);
        text = this.handleEscapedCharacters(text);
        text = this.handleSpecialCases(text);

        // Remove YAML frontmatter
        text = text.replace(this.patterns.blocks.yaml, '');

        // Process complex structures
        text = this.processNestedStructures(text);
        text = this.processTables(text);
        text = this.processLists(text);

        // Handle HTML if not preserved
        if (!this.options.preserveHTML) {
            text = this.removeHTMLAndComments(text);
        }

        // Process various markdown elements
        text = this.processFormatting(text);
        text = this.processBlocks(text);
        text = this.processLinks(text);
        text = this.processImages(text);
        text = this.processMath(text);

        // Final cleanup
        text = this.cleanupText(text);

        return text;
    }

    normalizeLineEndings(text) {
        return text.replace(/\r\n|\r/g, '\n');
    }

    handleEscapedCharacters(text) {
        return text.replace(/\\([\\`*_{}\[\]()#+\-.!$])/g, '$1');
    }

    handleSpecialCases(text) {
        return text
            .replace(/\\([\\`*_{}\[\]()#+\-.!])/g, '$1')
            .replace(/&(?:[a-z\d]+|#\d+|#x[a-f\d]+);/gi, match => {
                try {
                    return decodeURIComponent(match);
                } catch {
                    return match;
                }
            });
    }

        processNestedStructures(text) {
        let processed = text;
        let previous;
        
        do {
            previous = processed;
            processed = processed
                .replace(this.patterns.blocks.blockquotes, (match, level, content) => {
                    const depth = (level.match(/>/g) || []).length;
                    return '  '.repeat(depth - 1) + content.trim() + '\n';
                })
                .replace(/^(\s*)([-*+]|\d+[.)]|\[(?:\d+|[a-zA-Z])\]|\(?(?:\d+|[a-zA-Z])\))\s+/gm, 
                    (match, indent, marker) => ' '.repeat(indent.length + 2));
        } while (processed !== previous);

        return processed;
    }

    processTables(text) {
        const lines = text.split('\n');
        const result = [];
        let inTable = false;
        let headers = [];
        let alignments = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (this.patterns.tables.separator.test(line)) {
                inTable = true;
                alignments = line.split('|')
                    .filter(cell => cell.trim())
                    .map(cell => {
                        const trimmed = cell.trim();
                        if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
                        if (trimmed.endsWith(':')) return 'right';
                        return 'left';
                    });
                continue;
            }

            if (inTable && line.trim().startsWith('|')) {
                const cells = line.split('|')
                    .filter(cell => cell.trim())
                    .map(cell => cell.trim());
                
                if (!headers.length) {
                    headers = cells;
                } else {
                    result.push(cells.join('  '));
                }
            } else {
                inTable = false;
                if (headers.length) {
                    result.push(headers.join('  '));
                    headers = [];
                }
                result.push(line);
            }
        }

        return result.join('\n');
    }

    processLists(text) {
        const listStack = [];
        return text.split('\n').map(line => {
            const indent = line.match(/^\s*/)[0].length;
            let content = line.trim();

            content = content.replace(this.patterns.lists.tasks, (_, checked, text) => 
                `[${checked.toLowerCase() === 'x' ? '✓' : ' '}] ${text}`);

            content = content
                .replace(this.patterns.lists.ordered, '$2')
                .replace(this.patterns.lists.unordered, '$2');

            while (listStack.length && indent < listStack[listStack.length - 1]) {
                listStack.pop();
            }

            if (content && (content.startsWith('- ') || /^\d+[.)]\s/.test(content))) {
                listStack.push(indent);
                return '  '.repeat(listStack.length - 1) + content.replace(/^[-*+\d.)\s]+/, '');
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
            .replace(this.patterns.formatting.highlighter, '$1')
            .replace(this.patterns.formatting.checkbox, (_, checked) => 
                checked.toLowerCase() === 'x' ? '[✓]' : '[ ]')
            .replace(this.patterns.formatting.emoji, (_, code) => this.emojiMap[code] || code);
    }

    processBlocks(text) {
        return text
            .replace(this.patterns.blocks.headers, (_, level, content) => content + '\n\n')
            .replace(this.patterns.blocks.codeBlocks, (match, content1, content2, content3) => {
                const content = content1 || content2 || content3 || '';
                return content.trim() + '\n\n';
            })
            .replace(this.patterns.blocks.indentedCode, (match) => {
                return match.replace(/^(?: {4}|\t)/gm, '') + '\n';
            })
            .replace(this.patterns.blocks.horizontalRules, '\n');
    }

    processLinks(text) {
        return text
            .replace(this.patterns.links.definition, '')
            .replace(this.patterns.links.referenceMarker, '')
            .replace(this.patterns.links.inline, '$1')
            .replace(this.patterns.links.reference, '$1')
            .replace(this.patterns.links.autolink, '$1')
            .replace(this.patterns.links.footnote, '')
            .replace(this.patterns.links.footnoteDefinition, '')
            .replace(/\[([^\]]+)\]/g, '$1');
    }

    processImages(text) {
        return text
            .replace(this.patterns.images.inline, '$1')
            .replace(this.patterns.images.reference, '$1');
    }

    processMath(text) {
        return text
            .replace(this.patterns.math.block, '$1')
            .replace(this.patterns.math.inline, '$1')
            .replace(this.patterns.math.latex, '$1');
    }

    cleanupText(text) {
        let cleaned = text
            .replace(/&([a-zA-Z0-9]+);/g, (_, entity) => this.entityMap[entity] || entity)
            .replace(/\s+$/gm, '')
            .replace(/^\s+/gm, '')
            .replace(/\n{3,}/g, '\n\n')
            .replace(/\[\^[\w\d-]+\]/g, '')
            .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
            .replace(/\[\/\/\]:.*/g, '')
            .replace(/\[[^\]]*\](?:\[[^\]]*\])?/g, '')
            .trim();

        if (this.options.preserveLineBreaks) {
            cleaned = cleaned.replace(/\n/g, ' \n');
        } else {
            cleaned = cleaned.replace(/\n(?!\n)/g, ' ');
        }

        return cleaned;
    }

    buildEmojiMap() {
        return {
            // Smileys & Emotion
            'smile': '😊',
            'laughing': '😄',
            'joy': '😂',
            'rofl': '🤣',
            'grin': '😁',
            'smiley': '😃',
            'sweat_smile': '😅',
            'wink': '😉',
            'blush': '😊',
            'yum': '😋',
            'heart_eyes': '😍',
            'kissing': '😗',
            'kissing_heart': '😘',
            'kissing_closed_eyes': '😚',
            'kissing_smiling_eyes': '😙',
            'stuck_out_tongue': '😛',
            'stuck_out_tongue_winking_eye': '😜',
            'stuck_out_tongue_closed_eyes': '😝',
            'neutral_face': '😐',
            'expressionless': '😑',
            'no_mouth': '😶',
            'smirk': '😏',
            'unamused': '😒',
            'thinking': '🤔',
            'zipper_mouth': '🤐',
            'hugging': '🤗',
            'rolling_eyes': '🙄',
            'grimacing': '😬',
            'lying_face': '🤥',

            // Gestures & People
            'wave': '👋',
            'raised_hand': '✋',
            'thumbsup': '👍',
            'thumbsdown': '👎',
            'punch': '👊',
            'fist': '✊',
            'ok_hand': '👌',
            'clap': '👏',
            'pray': '🙏',
            'muscle': '💪',
            'point_up': '☝️',
            'point_down': '👇',
            'point_left': '👈',
            'point_right': '👉',

            // Hearts & Love
            'heart': '❤️',
            'orange_heart': '🧡',
            'yellow_heart': '💛',
            'green_heart': '💚',
            'blue_heart': '💙',
            'purple_heart': '💜',
            'black_heart': '🖤',
            'broken_heart': '💔',
            'two_hearts': '💕',
            'sparkling_heart': '💖',
            'heartbeat': '💓',
            'heartpulse': '💗',
            'cupid': '💘',

            // Symbols
            'star': '⭐',
            'sparkles': '✨',
            'check': '✓',
            'x': '❌',
            'warning': '⚠️',
            'question': '❓',
            'exclamation': '❗',
            'zap': '⚡',
            'fire': '🔥',
            'sunny': '☀️',
            'cloud': '☁️',
            'umbrella': '☔',
            'snowflake': '❄️',
            'rainbow': '🌈',

            // Objects
            'gift': '🎁',
            'trophy': '🏆',
            'medal': '🏅',
            'crown': '👑',
            'gem': '💎',
            'bell': '🔔',
            'lock': '🔒',
            'key': '🔑',
            'bulb': '💡',
            'book': '📖',
            'pencil': '📝',
            'phone': '📱',
            'computer': '💻',
            'cd': '💿',
            'camera': '📷',
            'tv': '📺',
            'radio': '📻',
            'speaker': '🔈',
            'clock': '🕐',
            'hourglass': '⌛',
            'money': '💰',
            'email': '📧',
            'mailbox': '📫',
        };
    }

    buildEntityMap() {
        return {
            // Basic HTML entities
            'amp': '&',
            'lt': '<',
            'gt': '>',
            'quot': '"',
            'apos': "'",

            // Copyright and registered symbols
            'copy': '©',
            'reg': '®',
            'trade': '™',

            // Currency symbols
            'cent': '¢',
            'pound': '£',
            'euro': '€',
            'yen': '¥',
            'curren': '¤',

            // Mathematical symbols
            'plusmn': '±',
            'times': '×',
            'divide': '÷',
            'minus': '−',
            'lowast': '∗',
            'radic': '√',
            'infin': '∞',
            'asymp': '≈',
            'ne': '≠',
            'equiv': '≡',
            'le': '≤',
            'ge': '≥',
            'sum': '∑',
            'prod': '∏',
            'prop': '∝',
            'ang': '∠',
            'and': '∧',
            'or': '∨',
            'cap': '∩',
            'cup': '∪',
            'int': '∫',
            'there4': '∴',
            'sim': '∼',
            'cong': '≅',
            'perp': '⊥',

            // Spacing and dashes
            'nbsp': ' ',
            'ensp': ' ',
            'emsp': ' ',
            'thinsp': ' ',
            'ndash': '–',
            'mdash': '—',

            // Quotation marks and apostrophes
            // Replace these lines in the buildEntityMap() method:

            // Quotation marks and apostrophes
            'lsquo': '\u2018', // Left single quotation mark
            'rsquo': '\u2019', // Right single quotation mark
            'sbquo': '\u201A', // Single low-9 quotation mark
            'ldquo': '\u201C', // Left double quotation mark
            'rdquo': '\u201D', // Right double quotation mark
            'bdquo': '\u201E', // Double low-9 quotation mark
            'laquo': '\u00AB', // Left-pointing double angle quotation mark
            'raquo': '\u00BB', // Right-pointing double angle quotation mark

            // Other punctuation and symbols
            'bull': '•',
            'hellip': '…',
            'prime': '′',
            'Prime': '″',
            'oline': '‾',
            'frasl': '⁄',
            'deg': '°',
            'micro': 'µ',
            'para': '¶',
            'middot': '·',
            'cedil': '¸',
            'ordf': 'ª',
            'ordm': 'º',
            'iexcl': '¡',
            'iquest': '¿',
            'shy': '­',
            'macr': '¯',
            'acute': '´',
            'uml': '¨',

            // Greek letters
            'Alpha': 'Α',
            'Beta': 'Β',
            'Gamma': 'Γ',
            'Delta': 'Δ',
            'Epsilon': 'Ε',
            'Zeta': 'Ζ',
            'Eta': 'Η',
            'Theta': 'Θ',
            'Iota': 'Ι',
            'Kappa': 'Κ',
            'Lambda': 'Λ',
            'Mu': 'Μ',
            'Nu': 'Ν',
            'Xi': 'Ξ',
            'Omicron': 'Ο',
            'Pi': 'Π',
            'Rho': 'Ρ',
            'Sigma': 'Σ',
            'Tau': 'Τ',
            'Upsilon': 'Υ',
            'Phi': 'Φ',
            'Chi': 'Χ',
            'Psi': 'Ψ',
            'Omega': 'Ω',
            'alpha': 'α',
            'beta': 'β',
            'gamma': 'γ',
            'delta': 'δ',
            'epsilon': 'ε',
            'zeta': 'ζ',
            'eta': 'η',
            'theta': 'θ',
            'iota': 'ι',
            'kappa': 'κ',
            'lambda': 'λ',
            'mu': 'μ',
            'nu': 'ν',
            'xi': 'ξ',
            'omicron': 'ο',
            'pi': 'π',
            'rho': 'ρ',
            'sigmaf': 'ς',
            'sigma': 'σ',
            'tau': 'τ',
            'upsilon': 'υ',
            'phi': 'φ',
            'chi': 'χ',
            'psi': 'ψ',
            'omega': 'ω',

            // Special characters
            'OElig': 'Œ',
            'oelig': 'œ',
            'Scaron': 'Š',
            'scaron': 'š',
            'Yuml': 'Ÿ',
            'fnof': 'ƒ',
            'circ': 'ˆ',
            'tilde': '˜',
            'dagger': '†',
            'Dagger': '‡',
        };
    }
}

module.exports = {
    MarkdownConverter
};
