const USERSCRIPT = `// ==UserScript==
// @name         Chaoxing Work Scraper (Clean Numbering)
// @namespace    cx-work-scraper
// @version      1.8.0
// @match        *://*.chaoxing.com/*work/dowork*
// @match        *://*.chaoxing.com/*exam*
// @match        *://*.chaoxing.com/*work/view*
// @match        *://*.chaoxing.com/exam-ans*
// @match        *://*.chaoxing.com/*/test/*
// @match        *://*.chaoxing.com/*paper*
// @match        *://*.chaoxing.com/mooc-ans/*
// @all-frames   true
// @run-at       document-end
// @grant        GM_addStyle
// @grant        GM_download
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function() {
  'use strict';

  // 标准化空白字符
  const normalizeText = s => (s || "").replace(/\s+/g, " ").trim();

  // 核心修改：增强的文本清洗函数
  const sanitizeAnswerText = s => {
    let t = normalizeText(s || "");

    // 1. 先去除文字前缀 (如 "正确答案：", "我的答案：")
    // 使用全局替换，防止出现 "(1) 我的答案: 内容" 这种情况
    t = t.replace(/(?:正确答案|标准答案|参考答案|Correct\s*Answer|我的答案|My\s*Answer)\s*[:：]?/gi, "");

    // 2. 循环去除序号
    // 匹配模式包括：
    // (1), （1）, [1], {1}  -> 括号包裹数字
    // 1., 1、, 1)           -> 数字加标点
    // 第1空                 -> 文字描述
    const indexPattern = /^\s*(?:第\s*\d+\s*空[:：]?|[\(\[\{（]\d+[\)\]\}）][.、]?|\d+[.、\)])\s*/;

    // 使用循环是为了处理多层嵌套，例如可能存在的脏数据 "(1) 1. 答案"
    while (indexPattern.test(t)) {
        t = t.replace(indexPattern, "");
    }

    // 3. 去除可能残留的冒号或空白
    t = t.replace(/^\s*[:：]\s*/, "");

    return t.trim();
  };

  const getQuestionTitle = box => {
    const markName = box.querySelector('.mark_name');
    if (markName) {
        const clone = markName.cloneNode(true);
        clone.querySelectorAll('.colorShallow, .colorGray').forEach(e => e.remove());
        return normalizeText(clone.textContent).replace(/^\d+\.\s*/, '');
    }
    const sel = [".subject",".stem",".title",".qTitle",".des",".topic",".problem",".quest-title",".quesTitle",".queTitle"];
    for (const q of sel) { const el = box.querySelector(q); if (el) return normalizeText(el.textContent); }
    const h = box.querySelector("h1,h2,h3,.hd,.head,.tt"); if (h) return normalizeText(h.textContent);
    return normalizeText(box.textContent.split('\n')[0]);
  };

  const detectType = box => {
    const titleText = box.querySelector('.mark_name, h3, .title')?.textContent || box.textContent;
    if (titleText) {
        if (/单选/.test(titleText)) return "单选";
        if (/多选/.test(titleText)) return "多选";
        if (/判断/.test(titleText)) return "判断";
        if (/填空/.test(titleText)) return "填空";
        if (/简答/.test(titleText)) return "简答";
    }
    const attrType = (box.getAttribute('typename') || box.getAttribute('typname') || '').trim();
    if (attrType) {
      if (/多选/.test(attrType)) return "多选";
      if (/单选/.test(attrType)) return "单选";
      if (/判断/.test(attrType)) return "判断";
      if (/填空/.test(attrType)) return "填空";
    }
    if (box.querySelector('input[type="radio"]')) return "单选";
    if (box.querySelector('input[type="checkbox"]')) return "多选";
    if (box.querySelector('input[type="text"], textarea')) return "填空";
    return "未知";
  };

  const extractImages = box => Array.from(new Set(Array.from(box.querySelectorAll("img")).map(img => img.src).filter(Boolean)));

  const extractOptions = box => {
    const listItems = Array.from(box.querySelectorAll('.mark_letter li, .qtDetail li, .optionList li, .options li'));
    if (listItems.length > 0) {
        return listItems.map(li => {
            const fullText = normalizeText(li.textContent);
            const match = fullText.match(/^([A-Z])\s*[.、．]\s*(.*)$/);
            if (match) {
                return { label: match[1], text: match[2] };
            }
            return { label: '', text: fullText };
        });
    }
    const nodes = Array.from(box.querySelectorAll('input[type="radio"], input[type="checkbox"]'))
        .map(input => input.closest('li, div') || input.parentElement);
    if(nodes.length > 0) {
         return nodes.map(n => ({label: '', text: normalizeText(n.textContent)}));
    }
    return [];
  };

  const extractSelectedRaw = box => {
    // 查找所有 .stuAnswerContent
    const stuAnss = Array.from(box.querySelectorAll('.stuAnswerContent'));
    if (stuAnss.length > 0) {
        return stuAnss.map(el => sanitizeAnswerText(el.textContent));
    }

    const checked = Array.from(box.querySelectorAll('input:checked'));
    if (checked.length) {
        return checked.map(input => {
             const li = input.closest('li') || input.parentElement;
             const text = normalizeText(li.textContent);
             const m = text.match(/^([A-Z])\s*[.、]/);
             return m ? m[1] : text;
        });
    }

    const fullText = box.textContent;
    const m = fullText.match(/(?:我的答案|My\s*Answer)\s*[:：]\s*(.*?)(?=\s+|$)/i);
    if (m) return [sanitizeAnswerText(m[1])];
    return [];
  };

  const extractStdAnswerRaw = box => {
    // 查找所有 .rightAnswerContent
    const rightAnss = Array.from(box.querySelectorAll('.rightAnswerContent'));
    if (rightAnss.length > 0) {
        return rightAnss.map(el => sanitizeAnswerText(el.textContent));
    }

    const fullText = box.textContent;
    const m = fullText.match(/(?:正确答案|标准答案|参考答案)\s*[:：]\s*(.*?)(?=\s+|$)/i);
    if (m) return [sanitizeAnswerText(m[1])];
    return [];
  };

  const mapLabelsToOptionText = (answers, options) => {
    if (!answers || !answers.length) return [];
    if (!options || !options.length) return answers;

    const mappedAnswers = [];
    answers.forEach(ans => {
        const cleanAns = ans.trim();
        let match = options.find(o => o.label === cleanAns);

        if (!match && /^[A-Z]+$/.test(cleanAns) && cleanAns.length > 1) {
             const splitChars = cleanAns.split('');
             splitChars.forEach(char => {
                 const subMatch = options.find(o => o.label === char);
                 if (subMatch) mappedAnswers.push(subMatch.text);
                 else mappedAnswers.push(char);
             });
             return;
        }

        if (!match && (cleanAns === 'A' || cleanAns === 'B') && options.length === 2) {
             const index = cleanAns.charCodeAt(0) - 65;
             if (options[index]) {
                 mappedAnswers.push(options[index].text);
                 return;
             }
        }

        if (match) {
            mappedAnswers.push(match.text);
        } else {
            mappedAnswers.push(cleanAns);
        }
    });
    return mappedAnswers;
  };

  const extractQuestion = (box, idx) => {
    const qType = detectType(box);
    const options = extractOptions(box);

    options.forEach((o, i) => {
        if (!o.label) o.label = String.fromCharCode(65 + i);
    });

    let selectedRaw = extractSelectedRaw(box);
    let correctRaw = extractStdAnswerRaw(box);

    let selectedText = mapLabelsToOptionText(selectedRaw, options);
    let correctText = mapLabelsToOptionText(correctRaw, options);

    return {
      id: idx + 1,
      type: qType,
      title: getQuestionTitle(box),
      options: options,
      correctAnswer: correctText,
      selectedAnswer: selectedText,
      images: extractImages(box)
    };
  };

  const collectBoxes = () => {
    let boxes = Array.from(document.querySelectorAll('.questionLi'));
    if (boxes.length === 0) {
        boxes = Array.from(document.querySelectorAll('.TiMu, .queBox, .examItem'));
    }
    return boxes;
  };

  const isValidQuestion = q => {
    if (q.type === '未知' && !q.title) return false;
    return true;
  };

  const scanQuestions = () => collectBoxes().map((b, i) => extractQuestion(b, i)).filter(isValidQuestion);

  const toCSV = data => {
    const esc = s => `"${String(s).replace(/"/g,'""')}"`;
    const rows = [["题号","题型","题目","选项","正确答案","用户答案","图片"]];
    data.forEach(q => {
        const opts = (q.options||[]).map(o=>`${o.label}.${o.text}`).join(" | ");
        const std = (q.correctAnswer||[]).join(" | ");
        const sel = (q.selectedAnswer||[]).join(" | ");
        const imgs = (q.images||[]).join(" | ");
        rows.push([q.id,q.type,q.title,opts,std,sel,imgs]);
    });
    return rows.map(r => r.map(esc).join(",")).join("\n");
  };

  const download = (filename, content, type="application/json") => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.download = filename;
    a.href = url;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const ensureUI = () => {
    if (document.getElementById("cx-scraper-panel")) return;
    const wrap = document.createElement("div"); wrap.id = "cx-scraper-panel";
    wrap.innerHTML = `<button data-act="copy">复制JSON</button><button data-act="json">下载JSON</button><button data-act="csv">下载CSV</button><button data-act="rescan">重新扫描</button>`;
    document.body.appendChild(wrap);
    GM_addStyle(`#cx-scraper-panel{position:fixed;right:16px;bottom:16px;z-index:99999;background:#111a;color:#fff;padding:10px;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.3);display:flex;gap:8px;flex-wrap:wrap}#cx-scraper-panel button{background:#2b6;color:#fff;border:none;padding:6px 10px;border-radius:6px;cursor:pointer}#cx-scraper-panel button:hover{background:#1a4}`);
    wrap.addEventListener("click", e => {
      const btn = e.target.closest("button"); if (!btn) return;
      const act = btn.getAttribute("data-act");
      const data = scanQuestions();
      console.log("Scraped Data:", data);
      if (act === "copy") {
          const json = JSON.stringify({ source: location.href, ts: Date.now(), items: data }, null, 2);
          if (typeof GM_setClipboard === "function") GM_setClipboard(json);
          else navigator.clipboard && navigator.clipboard.writeText(json);
          alert(`已复制 ${data.length} 道题目`);
      }
      else if (act === "json") { const json = JSON.stringify({ source: location.href, ts: Date.now(), items: data }, null, 2); download(`chaoxing_work_${Date.now()}.json`, json, "application/json"); }
      else if (act === "csv") { const csv = toCSV(data); download(`chaoxing_work_${Date.now()}.csv`, csv, "text/csv"); }
      else if (act === "rescan") { alert(`重新扫描完成，共发现 ${data.length} 题`); }
    });
  };

  const ready = () => { if (document.body) { ensureUI(); } else { setTimeout(ready, 500); } };
  ready();
})();`;

export default USERSCRIPT;
