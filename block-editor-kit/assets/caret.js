export function attachCaret(body, scrollPort, listen){
 const graphemes=new Intl.Segmenter('zh-CN',{granularity:'grapheme'});
 const caretMark=document.createElement('span');
 caretMark.className='bek-caret';
 caretMark.hidden=true;
 caretMark.setAttribute('aria-hidden','true');
 body.after(caretMark);
 let caretFrame,composing=false;
 let pressed;

 function updateCaret(){
  if(caretFrame!==undefined)return;
  caretFrame=requestAnimationFrame(()=>{
   caretFrame=undefined;
   const selection=getSelection();
   const anchor=composing?selection.focusNode:selection.anchorNode;
   const anchorElement=anchor?.nodeType===Node.TEXT_NODE?anchor.parentElement:anchor;
   const row=anchorElement?.closest?.('tr');
   const active=document.activeElement===body&&(selection.isCollapsed||composing)&&
    selection.rangeCount&&body.contains(anchor)&&(!row||getComputedStyle(row).position!=='sticky');
   let visible=false;
   if(active){
    const range=selection.getRangeAt(0).cloneRange();
    if(composing){
     range.setStart(anchor,selection.focusOffset);
     range.collapse(true);
    }
    const rect=range.getClientRects()[0];
    const viewport=scrollPort.getBoundingClientRect();
    const empty=body.dataset.empty==='true'&&!body.querySelector('table');
    const fallback=empty?body.getBoundingClientRect():null;
    const metrics=getComputedStyle(anchor.nodeType===Node.TEXT_NODE?anchor.parentElement:anchor);
    const height=rect?.height||parseFloat(metrics.fontSize);
    const x=rect?.height?rect.left:fallback?.left;
    const y=rect?.height?rect.top:fallback&&fallback.top+(parseFloat(metrics.lineHeight)-height)/2;
    visible=x>=Math.max(0,viewport.left)&&x<=Math.min(viewport.left+scrollPort.clientWidth,innerWidth)&&
     y>=Math.max(0,viewport.top)&&y+height<=Math.min(viewport.top+scrollPort.clientHeight,innerHeight);
    if(visible)Object.assign(caretMark.style,{left:x+'px',top:y+'px',height:height+'px'});
   }
   caretMark.hidden=!visible;
   caretMark.classList.toggle('is-composing',composing);
   body.classList.toggle('bek-thin-caret',visible);
  });
 }
 listen(document,'selectionchange',updateCaret);
 listen(document,'scroll',updateCaret,true);
 listen(window,'resize',updateCaret);
 for(const type of ['focus','blur','input'])listen(body,type,updateCaret);
 for(const type of ['compositionstart','compositionend'])listen(body,type,event=>{
  composing=event.type==='compositionstart';
  updateCaret();
 });
 listen(body,'compositionupdate',updateCaret);

 listen(body,'pointerdown',event=>{
  pressed=event.button===0?{x:event.clientX,y:event.clientY}:null;
 });
 listen(body,'click',event=>{
  const start=pressed;
  pressed=null;
  if(!start||event.detail!==1||event.shiftKey||event.metaKey||event.ctrlKey||event.altKey||
   Math.hypot(event.clientX-start.x,event.clientY-start.y)>=5)return;
  const {clientX:x,clientY:y}=event;
  const cell=event.target.closest('td,th');
  if(!cell&&event.target.closest('table'))return;
  if(!cell&&body.dataset.empty==='true'&&!body.querySelector('table')){
   body.focus({preventScroll:true});
   getSelection().collapse(body.firstElementChild?.matches('p,div')?body.firstElementChild:body,0);
   updateCaret();
   return;
  }
  if(!getSelection().isCollapsed)return;
  const content=document.createRange();
  content.selectNodeContents(body);
  if(!cell&&y>content.getBoundingClientRect().bottom){
   let line=body.lastElementChild;
   if(!line?.matches('p,div')||line.textContent||line.querySelector('table')||line!==body.lastChild){
    line=document.createElement('p');
    line.dataset.noteCaretLine='';
    line.append(document.createElement('br'));
    body.append(line);
   }
   body.focus({preventScroll:true});
   getSelection().collapse(line,0);
   return;
  }
  const selection=getSelection();
  const anchor=selection.anchorNode;
  if(!anchor||!body.contains(anchor))return;
  const element=anchor.nodeType===Node.TEXT_NODE?anchor.parentElement:anchor;
  const block=element.closest('p,div,li,h2,h3,h4,blockquote,td,th')||body;
  if(!body.contains(block)||cell&&!cell.contains(block))return;
  const walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT);
  const glyph=document.createRange();
  let lineEnd;
  for(let node=walker.nextNode();node;node=walker.nextNode()){
   if(node.parentElement.closest('td,th')!==cell)continue;
   glyph.selectNodeContents(node);
   if(!Array.from(glyph.getClientRects()).some(rect=>y>=rect.top&&y<=rect.bottom))continue;
   for(const {index,segment} of graphemes.segment(node.data)){
    if(!/\S/u.test(segment))continue;
    const end=index+segment.length;
    glyph.setStart(node,index);
    glyph.setEnd(node,end);
    for(const rect of glyph.getClientRects()){
     if(y<rect.top||y>rect.bottom||!rect.width)continue;
     if(x>=rect.left&&x<=rect.right){selection.collapse(node,end);return}
     if(!lineEnd||rect.right>=lineEnd.right)lineEnd={node,end,right:rect.right};
    }
   }
  }
  if(lineEnd)selection.collapse(lineEnd.node,lineEnd.end);
 });
 return ()=>cancelAnimationFrame(caretFrame);
}
