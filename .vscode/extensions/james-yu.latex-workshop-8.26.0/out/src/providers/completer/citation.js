"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Citation = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const latex_utensils_1 = require("latex-utensils");
const utils_1 = require("../../utils/utils");
class Fields extends Map {
    get author() {
        return this.get('author');
    }
    get journal() {
        return this.get('journal');
    }
    get journaltitle() {
        return this.get('journaltitle');
    }
    get title() {
        return this.get('title');
    }
    get publisher() {
        return this.get('publisher');
    }
    /**
     * Concatenate the values of the fields listed in `selectedFields`
     * @param selectedFields an array of field names
     * @param prefixWithKeys if true, every field is prefixed by 'Fieldname: '
     * @param joinString the string to use for joining the fields
     * @returns a string
     */
    join(selectedFields, prefixWithKeys, joinString = ' ') {
        const s = [];
        for (const key of this.keys()) {
            if (selectedFields.includes(key)) {
                const value = this.get(key);
                if (prefixWithKeys) {
                    s.push(key.charAt(0).toUpperCase() + key.slice(1) + ': ' + value);
                }
                else {
                    s.push(value);
                }
            }
        }
        return s.join(joinString);
    }
}
/**
 * Read the value `intellisense.citation.format`
 * @param configuration workspace configuration
 * @param excludedField A field to exclude from the list of citation fields. Primary usage is to not include `citation.label` twice.
 */
function readCitationFormat(configuration, excludedField) {
    const fields = configuration.get('intellisense.citation.format').map(f => { return f.toLowerCase(); });
    if (excludedField) {
        return fields.filter(f => f !== excludedField.toLowerCase());
    }
    return fields;
}
class Citation {
    constructor(extension) {
        /**
         * Bib entries in each bib `file`.
         */
        this.bibEntries = new Map();
        this.extension = extension;
    }
    provideFrom(_result, args) {
        return this.provide(args);
    }
    provide(args) {
        // Compile the suggestion array to vscode completion array
        const configuration = vscode.workspace.getConfiguration('latex-workshop', args.document.uri);
        const label = configuration.get('intellisense.citation.label');
        const fields = readCitationFormat(configuration);
        let range = undefined;
        const line = args.document.lineAt(args.position).text;
        const curlyStart = line.lastIndexOf('{', args.position.character);
        const commaStart = line.lastIndexOf(',', args.position.character);
        const startPos = Math.max(curlyStart, commaStart);
        if (startPos >= 0) {
            range = new vscode.Range(args.position.line, startPos + 1, args.position.line, args.position.character);
        }
        return this.updateAll(this.getIncludedBibs(this.extension.manager.rootFile)).map(item => {
            // Compile the completion item label
            switch (label) {
                case 'bibtex key':
                default:
                    break;
                case 'title':
                    if (item.fields.title) {
                        item.label = item.fields.title;
                    }
                    break;
                case 'authors':
                    if (item.fields.author) {
                        item.label = item.fields.author;
                    }
                    break;
            }
            item.filterText = item.key + ' ' + item.fields.join(fields, false);
            item.insertText = item.key;
            item.range = range;
            // We need two spaces to ensure md newline
            item.documentation = new vscode.MarkdownString('\n' + item.fields.join(fields, true, '  \n') + '\n\n');
            return item;
        });
    }
    browser(args) {
        const configuration = vscode.workspace.getConfiguration('latex-workshop', args === null || args === void 0 ? void 0 : args.document.uri);
        const label = configuration.get('intellisense.citation.label');
        const fields = readCitationFormat(configuration, label);
        void vscode.window.showQuickPick(this.updateAll(this.getIncludedBibs(this.extension.manager.rootFile)).map(item => {
            return {
                label: item.fields.title ? (0, utils_1.trimMultiLineString)(item.fields.title) : '',
                description: item.key,
                detail: item.fields.join(fields, true, ', ')
            };
        }), {
            placeHolder: 'Press ENTER to insert citation key at cursor',
            matchOnDetail: true,
            matchOnDescription: true,
            ignoreFocusOut: true
        }).then(selected => {
            if (!selected) {
                return;
            }
            if (vscode.window.activeTextEditor) {
                const editor = vscode.window.activeTextEditor;
                const content = editor.document.getText(new vscode.Range(new vscode.Position(0, 0), editor.selection.start));
                let start = editor.selection.start;
                if (content.lastIndexOf('\\cite') > content.lastIndexOf('}')) {
                    const curlyStart = content.lastIndexOf('{') + 1;
                    const commaStart = content.lastIndexOf(',') + 1;
                    start = editor.document.positionAt(curlyStart > commaStart ? curlyStart : commaStart);
                }
                void editor.edit(edit => edit.replace(new vscode.Range(start, editor.selection.start), selected.description || ''))
                    .then(() => editor.selection = new vscode.Selection(editor.selection.end, editor.selection.end));
            }
        });
    }
    getEntry(key) {
        const suggestions = this.updateAll();
        const entry = suggestions.find((elm) => elm.key === key);
        return entry;
    }
    /**
     * Returns the array of the paths of `.bib` files referenced from `file`.
     *
     * @param file The path of a LaTeX file. If `undefined`, the keys of `bibEntries` are used.
     * @param visitedTeX Internal use only.
     */
    getIncludedBibs(file, visitedTeX = []) {
        if (file === undefined) {
            // Only happens when rootFile is undefined
            return Array.from(this.bibEntries.keys());
        }
        if (!this.extension.manager.getCachedContent(file)) {
            return [];
        }
        const cache = this.extension.manager.getCachedContent(file);
        if (cache === undefined) {
            return [];
        }
        let bibs = cache.bibs;
        visitedTeX.push(file);
        for (const child of cache.children) {
            if (visitedTeX.includes(child.file)) {
                // Already included
                continue;
            }
            bibs = Array.from(new Set(bibs.concat(this.getIncludedBibs(child.file, visitedTeX))));
        }
        return bibs;
    }
    /**
     * Returns aggregated bib entries from `.bib` files and bibitems defined on LaTeX files included in the root file.
     *
     * @param bibFiles The array of the paths of `.bib` files. If `undefined`, the keys of `bibEntries` are used.
     */
    updateAll(bibFiles) {
        let suggestions = [];
        // From bib files
        if (bibFiles === undefined) {
            bibFiles = Array.from(this.bibEntries.keys());
        }
        bibFiles.forEach(file => {
            const entry = this.bibEntries.get(file);
            if (entry) {
                suggestions = suggestions.concat(entry);
            }
        });
        // From caches
        this.extension.manager.getIncludedTeX().forEach(cachedFile => {
            var _a;
            const cachedBibs = (_a = this.extension.manager.getCachedContent(cachedFile)) === null || _a === void 0 ? void 0 : _a.element.bibitem;
            if (cachedBibs === undefined) {
                return;
            }
            suggestions = suggestions.concat(cachedBibs.map(bib => {
                return { ...bib,
                    key: bib.label,
                    detail: bib.detail ? bib.detail : '',
                    file: cachedFile,
                    fields: new Fields()
                };
            }));
        });
        return suggestions;
    }
    /**
     * Parses `.bib` file. The results are stored in this instance.
     *
     * @param file The path of `.bib` file.
     */
    async parseBibFile(file) {
        this.extension.logger.addLogMessage(`Parsing .bib entries from ${file}`);
        const configuration = vscode.workspace.getConfiguration('latex-workshop', vscode.Uri.file(file));
        if (fs.statSync(file).size >= configuration.get('bibtex.maxFileSize') * 1024 * 1024) {
            this.extension.logger.addLogMessage(`Bib file is too large, ignoring it: ${file}`);
            this.bibEntries.delete(file);
            return;
        }
        const newEntry = [];
        const bibtex = fs.readFileSync(file).toString();
        const ast = await this.extension.pegParser.parseBibtex(bibtex).catch((e) => {
            if (latex_utensils_1.bibtexParser.isSyntaxError(e)) {
                const line = e.location.start.line;
                this.extension.logger.addLogMessage(`Error parsing BibTeX: line ${line} in ${file}.`);
            }
            throw e;
        });
        ast.content
            .filter(latex_utensils_1.bibtexParser.isEntry)
            .forEach((entry) => {
            if (entry.internalKey === undefined) {
                return;
            }
            const item = {
                key: entry.internalKey,
                label: entry.internalKey,
                file,
                position: new vscode.Position(entry.location.start.line - 1, entry.location.start.column - 1),
                kind: vscode.CompletionItemKind.Reference,
                fields: new Fields()
            };
            entry.content.forEach(field => {
                const value = Array.isArray(field.value.content) ?
                    field.value.content.join(' ') : this.deParenthesis(field.value.content);
                item.fields.set(field.name, value);
            });
            newEntry.push(item);
        });
        this.bibEntries.set(file, newEntry);
        this.extension.logger.addLogMessage(`Parsed ${newEntry.length} bib entries from ${file}.`);
    }
    removeEntriesInFile(file) {
        this.extension.logger.addLogMessage(`Remove parsed bib entries for ${file}`);
        this.bibEntries.delete(file);
    }
    /**
     * Updates the Manager cache for bibitems defined in `file`.
     * `content` is parsed with regular expressions,
     * and the result is used to update the cache.
     *
     * @param file The path of a LaTeX file.
     * @param content The content of a LaTeX file.
     */
    update(file, content) {
        const cache = this.extension.manager.getCachedContent(file);
        if (cache !== undefined) {
            cache.element.bibitem = this.parseContent(file, content);
        }
    }
    parseContent(file, content) {
        const itemReg = /^(?!%).*\\bibitem(?:\[[^[\]{}]*\])?{([^}]*)}/gm;
        const items = [];
        while (true) {
            const result = itemReg.exec(content);
            if (result === null) {
                break;
            }
            const postContent = content.substring(result.index + result[0].length, content.indexOf('\n', result.index)).trim();
            const positionContent = content.substring(0, result.index).split('\n');
            items.push({
                key: result[1],
                label: result[1],
                file,
                kind: vscode.CompletionItemKind.Reference,
                detail: `${postContent}\n...`,
                fields: new Fields(),
                position: new vscode.Position(positionContent.length - 1, positionContent[positionContent.length - 1].length)
            });
        }
        return items;
    }
    deParenthesis(str) {
        // Remove wrapping { }
        // Extract the content of \url{}
        return str.replace(/\\url{([^\\{}]+)}/g, '$1').replace(/{+([^\\{}]+)}+/g, '$1');
    }
}
exports.Citation = Citation;
//# sourceMappingURL=citation.js.map