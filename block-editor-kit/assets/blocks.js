 const headings='h2,h3,h4';
 const lists='ul,ol';
 const structural='p,div,blockquote,h1,h2,h3,h4,h5,h6,ul,ol,li,table';
 const editableBlock='p,h2,h3,h4';
 const elementOf=node=>node?.nodeType===Node.TEXT_NODE?node.parentElement:node;
 const isElement=node=>node.nodeType===Node.ELEMENT_NODE;
 const lineOf=block=>block?.matches(lists)?block.firstElementChild:block;
 const listDepth=block=>Number(block.dataset.noteListDepth)||0;
 function setListDepth(block,depth){
  if(depth)block.dataset.noteListDepth=String(depth);
  else delete block.dataset.noteListDepth;
 }

 function fillLine(line){
  if(!line.textContent&&!line.querySelector('br'))line.append(document.createElement('br'));
 }
 function createBlock(tag,children=[],start=null){
  const block=document.createElement(tag);
  if(tag==='ol'&&start!==null)block.setAttribute('start',start);
  if(block.matches(lists))block.append(document.createElement('li'));
  const line=lineOf(block);
  line.append(...children);
  fillLine(line);
  return block;
 }
 function removePlaceholder(line){
  if(!line.textContent&&line.querySelectorAll('br').length===1)line.querySelector('br').remove();
 }
 function caretLine(){
  const line=createBlock('p');
  line.dataset.noteCaretLine='';
  return line;
 }

 // Loaded HTML and clipboard HTML can contain grouped lists, browser paragraphs or legacy nested lists.
 function flatten(root){
  const blocks=[],owners=new Map();
  function appendContainer(container,tag,emit,keepEmpty=false,depth=0){
   let inline=[],produced=false;
   function flush(){
    if(!inline.length)return;
    const wrapper=container.matches?.('p,div,li,blockquote,h1,h2,h3,h4,h5,h6')&&
     (container.style.color||container.style.fontWeight||container.className.startsWith('note-color-'));
    if(wrapper){
     const span=document.createElement('span');
     span.style.color=container.style.color;
     span.style.fontWeight=container.style.fontWeight;
     span.className=container.className;
     span.append(...inline);
     inline=[span];
    }
    const block=emit(tag,inline);
    if(!owners.has(container))owners.set(container,lineOf(block));
    inline=[];
    produced=true;
   }
   for(const node of [...container.childNodes]){
    if(isElement(node)&&node.matches(structural)){
     flush();
     if((tag==='ul'||tag==='ol')&&node.matches('p,div,blockquote'))appendContainer(node,tag,emit,true,depth);
     else append(node,push,depth+(tag==='ul'||tag==='ol'?1:0));
     produced=true;
    }else if(isElement(node)&&node.querySelector(structural)){
     flush();
     appendContainer(node,tag,emit,false,depth);
     produced=true;
    }else if(isElement(node)||node.nodeType===Node.TEXT_NODE){
     if(inline.length||node.nodeType!==Node.TEXT_NODE||node.data.trim()||
      (container.tagName&&node.data.includes(' ')&&!/[\r\n]/.test(node.data)))inline.push(node);
    }
   }
   if(keepEmpty&&!produced&&!inline.length)inline=[document.createElement('br')];
   flush();
  }
  function push(tag,children,start){
   const block=createBlock(tag,children,start);
   blocks.push(block);
   return block;
  }
  function append(node,emit,depth){
   if(node.matches('table')){blocks.push(node);return}
   if(node.matches(lists)){
    const tag=node.localName;
    depth=Math.max(depth,listDepth(node));
    let start=node.hasAttribute('data-note-derived-start')?null:node.getAttribute('start');
    for(const item of [...node.children]){
     if(!item.matches('li')){append(item,emit,depth);continue}
     if(tag==='ol'&&item.hasAttribute('value'))start=item.getAttribute('value');
     appendContainer(item,tag,(type,children)=>{
      const block=emit(type,children,type===tag?start:null);
      setListDepth(block,depth);
      if(type===tag)start=null;
      return block;
     },true,depth);
    }
    return;
   }
   const tag=node.matches(headings)?node.localName:node.matches('h1,h5,h6')?'h3':'p';
   appendContainer(node,tag,emit,true);
  }
  appendContainer(root,'p',push);
  return {blocks,owners};
 }

 export function attachNoteBlocks(editor){
  const signal=()=>editor.dispatchEvent(new Event('input',{bubbles:true}));
  function blockOf(node){
   let block=elementOf(node);
   if(block===editor)return null;
   while(block&&block.parentElement!==editor)block=block.parentElement;
   return block;
  }
  function blockAt(node,offset){
   if(node===editor){
    const following=editor.childNodes[offset];
    const block=following||editor.lastElementChild;
    return {block,line:lineOf(block),offset:following?0:lineOf(block)?.childNodes.length};
   }
   const block=blockOf(node);
   return {block,line:lineOf(block)};
  }
  function ensureSelection(selection){
   if(!selection.rangeCount||!editor.contains(selection.focusNode))selection.collapse(editor,editor.childNodes.length);
   const {block,line,offset}=blockAt(selection.focusNode,selection.focusOffset);
   if(selection.isCollapsed&&block&&!block.matches('table')&&!line.contains(selection.focusNode))selection.collapse(line,offset||0);
   return block;
  }
  function updateLists(){
   const numbers=[];
   let previousDepth=-1;
   for(const block of editor.children){
    if(!block.matches(lists)){numbers.length=0;previousDepth=-1;continue}
    const depth=Math.min(listDepth(block),previousDepth+1);
    setListDepth(block,depth);
    block.style.setProperty('--note-list-depth',depth);
    block.dataset.noteListMarker=String(depth%3);
    numbers.length=depth+1;
    previousDepth=depth;
    if(block.matches('ul')){numbers[depth]=1;continue}
    let number=numbers[depth]??1;
    if(block.hasAttribute('start')&&!block.hasAttribute('data-note-derived-start'))number=block.start;
    else{
     block.dataset.noteDerivedStart='';
     block.start=Math.min(number,2147483647);
    }
    numbers[depth]=number+1;
   }
  }
  function canonical(node){
   if(!isElement(node))return false;
   if(node.matches('table'))return true;
   if(node.matches(lists)){
    if(node.childNodes.length!==1||!node.firstElementChild?.matches('li')||node.firstElementChild.hasAttribute('value'))return false;
    return !node.firstElementChild.querySelector(structural);
   }
   return node.matches(editableBlock)&&!node.querySelector(structural);
  }
  function normalize(){
   if(!editor.childNodes.length)editor.append(caretLine());
   else if(![...editor.childNodes].every(canonical)){
    const selection=getSelection();
    const selected=selection.rangeCount&&editor.contains(selection.anchorNode)&&editor.contains(selection.focusNode);
    const anchor=selected&&[selection.anchorNode,selection.anchorOffset],focus=selected&&[selection.focusNode,selection.focusOffset];
    const {blocks,owners}=flatten(editor);
    editor.replaceChildren(...(blocks.length?blocks:[caretLine()]));
    if(selected){
     const restore=([node,offset])=>{
      const target=editor.contains(node)?node:owners.get(node)||lineOf(editor.lastElementChild);
      const length=target.nodeType===Node.TEXT_NODE?target.length:target.childNodes.length;
      return [target,Math.min(offset,length)];
     };
     selection.setBaseAndExtent(...restore(anchor),...restore(focus));
    }
   }
   updateLists();
  }
  function changeType(block,tag,start=null){
   const oldLine=lineOf(block);
   const replacement=createBlock(tag,[...oldLine.childNodes],start);
   if(block.matches(lists)&&replacement.matches(lists))setListDepth(replacement,listDepth(block));
   const line=lineOf(replacement);
   line.className=oldLine.className;
   line.style.color=oldLine.style.color;
   line.style.fontWeight=oldLine.style.fontWeight;
   block.replaceWith(replacement);
   return line;
  }
  function format(selection,tag){
   const active=ensureSelection(selection);
   if(!active||active.matches('table')&&selection.isCollapsed)return;
   const {anchorNode,anchorOffset,focusNode,focusOffset}=selection;
   const selected=selection.getRangeAt(0), replacements=new Map();
   const from=selected.cloneRange(),to=selected.cloneRange();
   from.collapse(true);
   to.collapse(false);
   const affected=[...editor.children].filter(block=>{
    if(block.matches('table')||block.localName===tag)return false;
    if(selection.isCollapsed)return block===active;
    const content=document.createRange();
    content.selectNodeContents(lineOf(block));
    const start=content.cloneRange();
    start.collapse(true);
    content.collapse(false);
    return from.compareBoundaryPoints(Range.START_TO_START,content)<0&&
     to.compareBoundaryPoints(Range.START_TO_START,start)>0;
   });
   for(const block of affected){
    const oldLine=lineOf(block);
    const line=changeType(block,tag);
    replacements.set(oldLine,line);
    replacements.set(block,line);
   }
   if(replacements.size){
    selection.setBaseAndExtent(replacements.get(anchorNode)||anchorNode,anchorOffset,
     replacements.get(focusNode)||focusNode,focusOffset);
   }
  }
  function prefix(event){
   if(event.inputType!=='insertText'||event.data!==' '||event.isComposing||!event.cancelable)return;
   const selection=getSelection();
   if(!selection.isCollapsed||!editor.contains(selection.anchorNode))return;
   const block=blockOf(selection.anchorNode);
   if(!block||block.matches('table'))return;
   const before=selection.getRangeAt(0).cloneRange();
   before.setStart(lineOf(block),0);
   const marker=before.toString(),match=marker.match(/^(\d+)\.$/);
   const number=match?Number(match[1]):0;
   if(marker!=='*'&&(number<1||number>2147483647))return;
   event.preventDefault();
   before.deleteContents();
   selection.collapse(changeType(block,number?'ol':'ul',number||null),0);
   signal();
  }
  function enter(selection,block){
   const line=lineOf(block);
   if(block.matches(lists)&&!line.textContent&&!line.querySelector('br+br')){
    selection.collapse(changeType(block,'p'),0);
    signal();
    return;
   }
   const tail=selection.getRangeAt(0).cloneRange();
   tail.setEnd(line,line.childNodes.length);
   const next=createBlock(block.matches(lists)?block.localName:'p',[...tail.extractContents().childNodes]);
   fillLine(line);
   line.removeAttribute('data-note-caret-line');
   let preceding=block;
   if(next.matches(lists)){
    setListDepth(next,listDepth(block));
    while(preceding.nextElementSibling?.matches(lists)&&listDepth(preceding.nextElementSibling)>listDepth(block)){
     preceding=preceding.nextElementSibling;
    }
   }
   preceding.after(next);
   selection.collapse(lineOf(next),0);
   signal();
  }
  function join(event,selection,block){
   const line=lineOf(block);
   const backward=event.key==='Backspace';
   if(backward&&block===editor.firstElementChild&&block.matches('p')&&!line.textContent){
    event.preventDefault();
    block.remove();
    if(!editor.firstElementChild)editor.append(caretLine());
    const first=editor.firstElementChild;
    const target=first.matches('table')?first.rows[0]?.cells[0]||first:lineOf(first);
    selection.collapse(target,0);
    signal();
    return;
   }
   const section=selection.getRangeAt(0).cloneRange();
   if(backward)section.setStart(line,0);
   else section.setEnd(line,line.childNodes.length);
   const breaks=section.cloneContents().querySelectorAll('br');
   if(section.toString()||(breaks.length&&(backward||breaks[0].nextSibling||breaks.length>1)&&
    (line.textContent||line.querySelectorAll('br').length>1)))return;
   event.preventDefault();
   if(backward&&block.matches(lists)){
    if(listDepth(block))changeListDepth(block,true);
    else{
     shiftListChildren(block,0,-1);
     selection.collapse(changeType(block,'p'),0);
     signal();
    }
    return;
   }
   const adjacent=backward?block.previousElementSibling:block.nextElementSibling;
   if(!adjacent)return;
   if(adjacent.matches('table')){
    const row=backward?adjacent.rows[adjacent.rows.length-1]:adjacent.rows[0];
    const cell=backward?row?.cells[row.cells.length-1]:row?.cells[0];
    if(cell)selection.collapse(cell,backward?cell.childNodes.length:0);
    return;
   }
   const first=backward?adjacent:block,last=backward?block:adjacent;
   const destination=lineOf(first),source=lineOf(last);
   removePlaceholder(destination);
   const offset=destination.childNodes.length;
   removePlaceholder(source);
   destination.append(...source.childNodes);
   fillLine(destination);
   last.remove();
   selection.collapse(destination,offset);
   signal();
  }
  function shiftListChildren(block,depth,delta){
   for(let child=block.nextElementSibling;child?.matches(lists)&&listDepth(child)>depth;child=child.nextElementSibling){
    setListDepth(child,listDepth(child)+delta);
   }
  }
  function changeListDepth(block,outdent){
   const depth=listDepth(block);
   const previous=block.previousElementSibling;
   if(outdent?depth===0:!previous?.matches(lists)||listDepth(previous)<depth)return;
   const delta=outdent?-1:1;
   setListDepth(block,depth+delta);
   shiftListChildren(block,depth,delta);
   signal();
  }
  function keydown(event){
   if(event.isComposing||event.keyCode===229||event.ctrlKey||event.metaKey||event.altKey)return;
   if(event.key==='Tab'){
    event.preventDefault();
    const selection=getSelection();
    const block=selection.isCollapsed?ensureSelection(selection):null;
    if(block?.matches(lists))changeListDepth(block,event.shiftKey);
    return;
   }
   if(!['Enter','Backspace','Delete'].includes(event.key)||event.shiftKey)return;
   const selection=getSelection();
   let block=ensureSelection(selection);
   if(!block||block.matches('table'))return;
   if(event.key==='Enter'){
    event.preventDefault();
    if(!selection.isCollapsed)document.execCommand('delete');
    block=ensureSelection(selection);
    if(block&&!block.matches('table'))enter(selection,block);
   }else if(selection.isCollapsed)join(event,selection,block);
  }
  function insertTable(selection,table){
   const block=ensureSelection(selection);
   if(block)block.after(table);
   else editor.append(table);
   if(block?.hasAttribute('data-note-caret-line')&&!block.textContent)block.remove();
   const cell=table.rows[0]?.cells[0];
   if(cell)selection.collapse(cell,0);
  }
  function paste(selection,html,text){
   const active=ensureSelection(selection);
   const template=document.createElement('template');
   template.innerHTML=html;
   const hasStructure=template.content.querySelector(structural);
   if(active?.matches('table')&&!template.content.querySelector('table')||
    !hasStructure&&!/[\r\n]/.test(text)){
    document.execCommand(html?'insertHTML':'insertText',false,html||text);
    return;
   }
   const pasted=html?flatten(template.content).blocks:
    text.split(/\r\n|\r|\n/).map(value=>createBlock('p',[document.createTextNode(value)]));
   if(!pasted.length)return;
   if(!selection.isCollapsed&&!active?.matches('table'))document.execCommand('delete');
   const block=ensureSelection(selection);
   if(!block){editor.append(...pasted);signal();return}
   const line=lineOf(block);
   let trailing;
   if(!block.matches('table')){
    const tail=selection.getRangeAt(0).cloneRange();
    tail.setEnd(line,line.childNodes.length);
    const content=tail.extractContents();
    if(content.textContent||content.querySelector('br')&&line.textContent){
     trailing=createBlock(block.localName,[...content.childNodes]);
     if(block.matches(lists))setListDepth(trailing,listDepth(block));
    }
    if(line.textContent)fillLine(line);
   }
   const last=pasted[pasted.length-1];
   block.after(...pasted,...(trailing?[trailing]:[]));
   if(!block.matches('table')&&!line.textContent)block.remove();
   const caret=last.matches('table')?last.rows[0]?.cells[0]:lineOf(last);
   if(caret)selection.collapse(caret,last.matches('table')?0:caret.childNodes.length);
   signal();
  }
  function serialize(html){
   const template=document.createElement('template');
   template.innerHTML=html;
   const levels=[];
   for(const block of [...template.content.children]){
    if(!block.matches(lists)){levels.length=0;continue}
    const depth=Math.min(listDepth(block),levels.length);
    delete block.dataset.noteListDepth;
    levels.length=depth+1;
    const previous=levels[depth];
    if(block.localName===previous?.localName&&!block.hasAttribute('start')){
     previous.append(...block.childNodes);
     block.remove();
    }else{
     if(depth)levels[depth-1].lastElementChild.append(block);
     levels[depth]=block;
    }
   }
   return template.innerHTML;
  }
  editor.addEventListener('input',normalize);
  editor.addEventListener('beforeinput',prefix);
  editor.addEventListener('keydown',keydown);
  return {normalize,format,insertTable,paste,serialize};
 }
