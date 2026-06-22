import type { QuestionBank } from '../types/types';
import scriptContent from '../assets/script.js?raw';

import DataStructureAssignment from '../assets/data/数据结构作业1.json'
import DataStructureAssignment2 from '../assets/data/数据结构期末复习题.json'

export const USERSCRIPT_CONTENT = `// ==UserScript==
// @name         Chaoxing Work Scraper
// @namespace    cx-work-scraper
// @version      1.3.0
// @description  提取超星作业页题目与选项，导出JSON/CSV
// @match        *://*.chaoxing.com/*work/dowork*
// @match        *://*.chaoxing.com/*exam*
// @all-frames   true
// @grant        GM_addStyle
// @grant        GM_download
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function() {
  /* ... Please use the full script from the copy button ... */
})();
`;

export const FULL_USERSCRIPT = scriptContent;

export const DEFAULT_BANKS: QuestionBank[] = [
  {
    id: 'default-data-structure',
    name: '数据结构作业题',
    createdAt: 1765255903203,
    questions: DataStructureAssignment
  },
  {
    id: 'default-data-structure-2',
    name: '数据结构期末复习题',
    createdAt: 1765255903204,
    questions: DataStructureAssignment2
  }
];