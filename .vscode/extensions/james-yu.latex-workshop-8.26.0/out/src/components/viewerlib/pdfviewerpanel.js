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
exports.PdfViewerPanelService = exports.PdfViewerPanelSerializer = exports.PdfViewerPanel = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const utils_1 = require("../../utils/utils");
const eventbus_1 = require("../eventbus");
class PdfViewerPanel {
    constructor(extension, pdfFileUri, panel) {
        this.extension = extension;
        this.pdfFileUri = pdfFileUri;
        this.webviewPanel = panel;
        panel.webview.onDidReceiveMessage((msg) => {
            switch (msg.type) {
                case 'state': {
                    this._state = msg.state;
                    this.extension.eventBus.fire(eventbus_1.PdfViewerStatusChanged, msg.state);
                    break;
                }
                default: {
                    break;
                }
            }
        });
    }
    get state() {
        return this._state;
    }
}
exports.PdfViewerPanel = PdfViewerPanel;
class PdfViewerPanelSerializer {
    constructor(extension, panelService, service) {
        this.extension = extension;
        this.panelService = panelService;
        this.managerService = service;
    }
    async deserializeWebviewPanel(panel, argState) {
        await this.extension.server.serverStarted;
        this.extension.logger.addLogMessage(`Restoring the PDF viewer at the column ${panel.viewColumn} from the state: ${JSON.stringify(argState)}`);
        const state = argState.state;
        let pdfFileUri;
        if (state.path) {
            pdfFileUri = vscode.Uri.file(state.path);
        }
        else if (state.pdfFileUri) {
            pdfFileUri = vscode.Uri.parse(state.pdfFileUri, true);
        }
        if (!pdfFileUri) {
            this.extension.logger.addLogMessage('Error of restoring PDF viewer: the path of PDF file is undefined.');
            panel.webview.html = '<!DOCTYPE html> <html lang="en"><meta charset="utf-8"/><br>The path of PDF file is undefined.</html>';
            return;
        }
        if (!await this.extension.lwfs.exists(pdfFileUri)) {
            const s = (0, utils_1.escapeHtml)(pdfFileUri.toString());
            this.extension.logger.addLogMessage(`Error of restoring PDF viewer: file not found ${pdfFileUri.toString(true)}.`);
            panel.webview.html = `<!DOCTYPE html> <html lang="en"><meta charset="utf-8"/><br>File not found: ${s}</html>`;
            return;
        }
        panel.webview.html = await this.panelService.getPDFViewerContent(pdfFileUri);
        const pdfPanel = new PdfViewerPanel(this.extension, pdfFileUri, panel);
        this.managerService.initiatePdfViewerPanel(pdfPanel);
        return;
    }
}
exports.PdfViewerPanelSerializer = PdfViewerPanelSerializer;
class PdfViewerPanelService {
    constructor(extension) {
        this.extension = extension;
    }
    encodePathWithPrefix(pdfFileUri) {
        return this.extension.server.pdfFilePathEncoder.encodePathWithPrefix(pdfFileUri);
    }
    async createPdfViewerPanel(pdfFileUri, viewColumn) {
        await this.extension.server.serverStarted;
        const htmlContent = await this.getPDFViewerContent(pdfFileUri);
        const panel = vscode.window.createWebviewPanel('latex-workshop-pdf', path.basename(pdfFileUri.path), viewColumn, {
            enableScripts: true,
            retainContextWhenHidden: true
        });
        panel.webview.html = htmlContent;
        const pdfPanel = new PdfViewerPanel(this.extension, pdfFileUri, panel);
        return pdfPanel;
    }
    getKeyboardEventConfig() {
        const configuration = vscode.workspace.getConfiguration('latex-workshop');
        const setting = configuration.get('viewer.pdf.internal.keyboardEvent', 'auto');
        if (setting === 'auto') {
            return true;
        }
        else if (setting === 'force') {
            return true;
        }
        else {
            return false;
        }
    }
    /**
     * Returns the HTML content of the internal PDF viewer.
     *
     * @param pdfFile The path of a PDF file to be opened.
     */
    async getPDFViewerContent(pdfFile) {
        const serverPort = this.extension.server.port;
        // viewer/viewer.js automatically requests the file to server.ts, and server.ts decodes the encoded path of PDF file.
        const origUrl = `http://127.0.0.1:${serverPort}/viewer.html?incode=1&file=${this.encodePathWithPrefix(pdfFile)}`;
        const url = await vscode.env.asExternalUri(vscode.Uri.parse(origUrl, true));
        const iframeSrcOrigin = `${url.scheme}://${url.authority}`;
        const iframeSrcUrl = url.toString(true);
        this.extension.logger.addLogMessage(`The internal PDF viewer url: ${iframeSrcUrl}`);
        const rebroadcast = this.getKeyboardEventConfig();
        return `
        <!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; frame-src ${iframeSrcOrigin}; script-src 'unsafe-inline'; style-src 'unsafe-inline';"></head>
        <body><iframe id="preview-panel" class="preview-panel" src="${iframeSrcUrl}" style="position:absolute; border: none; left: 0; top: 0; width: 100%; height: 100%;">
        </iframe>
        <script>
        // When the tab gets focus again later, move the
        // the focus to the iframe so that keyboard navigation works in the pdf.
        const iframe = document.getElementById('preview-panel');
        window.onfocus = function() {
            setTimeout(function() { // doesn't work immediately
                iframe.contentWindow.focus();
            }, 100);
        }
        
        const vsStore = acquireVsCodeApi();
        // To enable keyboard shortcuts of VS Code when the iframe is focused,
        // we have to dispatch keyboard events in the parent window.
        // See https://github.com/microsoft/vscode/issues/65452#issuecomment-586036474
        window.addEventListener('message', (e) => {
            if (e.origin !== '${iframeSrcOrigin}') {
                return;
            }
            switch (e.data.type) {
                case 'initialized': {
                    const state = vsStore.getState();
                    if (state) {
                        state.type = 'restore_state';
                        iframe.contentWindow.postMessage(state, '${iframeSrcOrigin}');
                    }
                    break;
                }
                case 'keyboard_event': {
                    if (${rebroadcast}) {
                        window.dispatchEvent(new KeyboardEvent('keydown', e.data.event));
                    }
                    break;
                }
                case 'state': {
                    vsStore.setState(e.data);
                    break;
                }
                default:
                break;
            }
            vsStore.postMessage(e.data)
        });
        </script>
        </body></html>
        `;
    }
}
exports.PdfViewerPanelService = PdfViewerPanelService;
//# sourceMappingURL=pdfviewerpanel.js.map