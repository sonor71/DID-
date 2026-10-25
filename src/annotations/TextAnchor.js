export function textOffset(root,node,offset){const range=document.createRange();range.selectNodeContents(root);range.setEnd(node,offset);return range.toString().length;}
export function captureTextAnchor(root,selection=window.getSelection()){
  if(!root||!selection?.rangeCount||selection.isCollapsed)return null;const range=selection.getRangeAt(0);if(!root.contains(range.commonAncestorContainer))return null;
  const selectedText=selection.toString().trim();if(!selectedText)return null;const startOffset=textOffset(root,range.startContainer,range.startOffset),endOffset=startOffset+selection.toString().length,whole=root.innerText||root.textContent||'';
  return {blockId:range.startContainer.parentElement?.closest?.('[data-block-id]')?.dataset.blockId||null,startOffset,endOffset,selectedText:selectedText.slice(0,1000),prefixText:whole.slice(Math.max(0,startOffset-32),startOffset),suffixText:whole.slice(endOffset,endOffset+32)};
}
