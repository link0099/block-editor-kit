 function simpleTable(table){
  const rows=[...table.rows];
  const columns=rows[0]?.cells.length;
  return Boolean(columns&&rows.every(row=>row.cells.length===columns&&
   [...row.cells].every(cell=>cell.colSpan===1&&cell.rowSpan===1&&!cell.querySelector('table'))));
 }

 function fillCell(cell){
  cell.append(document.createElement('br'));
  return cell;
 }

 const minimumWidth=90;
 const widthGroup=table=>table.querySelector(':scope > colgroup[data-note-widths]');
 function copyTable(table){
  const copy=table.cloneNode(true);
  copy.querySelectorAll('.note-table-handle').forEach(handle=>handle.remove());
  copy.querySelectorAll('.note-table-cell-selected').forEach(cell=>cell.classList.remove('note-table-cell-selected'));
  return copy;
 }
 function writeColumnWidths(table,widths){
  let group=widthGroup(table);
  if(!group){
   for(const old of table.querySelectorAll(':scope > colgroup'))old.remove();
   group=document.createElement('colgroup');
   group.setAttribute('data-note-widths','');
   const caption=table.querySelector(':scope > caption');
   if(caption)caption.after(group);
   else table.prepend(group);
  }
  group.replaceChildren(...widths.map(width=>{
   const column=document.createElement('col');
   column.style.width=width+'px';
   return column;
  }));
  table.style.width=widths.reduce((total,width)=>total+width,0)+'px';
 }

 function adjustStoredWidths(table,index,remove){
  const group=widthGroup(table);
  if(!group)return;
  const widths=[...group.children].map(col=>parseInt(col.style.width,10)||minimumWidth);
  if(remove)widths.splice(index,1);
  else widths.splice(index,0,widths[index-1]||widths[index]||minimumWidth);
  writeColumnWidths(table,widths);
 }

 function changeTable(table,cell,action){
  const row=cell.parentElement;
  const rows=[...table.rows];
  const column=cell.cellIndex;
  switch(action){
   case 'append-row':
   case 'insert-row-above':
   case 'insert-row':{
    const anchor=action==='append-row'?rows.at(-1):row;
    const section=anchor.parentElement;
    const index=anchor.sectionRowIndex+(action==='insert-row-above'?0:1);
    const atHeaderEnd=section===table.tHead&&index===section.rows.length;
    const added=atHeaderEnd?(table.tBodies[0]||table.createTBody()).insertRow(0):section.insertRow(index);
    for(const source of anchor.cells){
     const tag=added.parentElement===table.tHead&&source.tagName==='TH'?'th':'td';
     added.append(fillCell(document.createElement(tag)));
    }
    return added.cells[column];
   }
   case 'append-column':
   case 'insert-column-left':
   case 'insert-column':{
    const index=action==='append-column'?rows[0].cells.length:column+(action==='insert-column-left'?0:1);
    for(const current of rows){
     const tag=[...current.cells].every(item=>item.tagName==='TH')?'th':'td';
     current.insertBefore(fillCell(document.createElement(tag)),current.cells[index]||null);
    }
    adjustStoredWidths(table,index,false);
    return row.cells[index];
   }
   case 'delete-row':{
    const next=rows[row.rowIndex+1]||rows[row.rowIndex-1];
    row.remove();
    return next.cells[column];
   }
   case 'delete-column':
    for(const current of rows)current.deleteCell(column);
    adjustStoredWidths(table,column,true);
    return row.cells[Math.min(column,row.cells.length-1)];
   case 'duplicate-table':{
    const copy=copyTable(table);
    table.after(fillCell(document.createElement('p')),copy);
    return copy.rows[row.rowIndex].cells[column];
   }
   case 'delete-table':{
    const paragraph=fillCell(document.createElement('p'));
    table.replaceWith(paragraph);
    return paragraph;
   }
   case 'header-row':
    table.dataset.headerRow=String(!hasHeaderRow(table));
    break;
   case 'header-column':
    table.dataset.headerColumn=String(table.dataset.headerColumn!=='true');
    break;
  }
  return cell;
 }

 function hasHeaderRow(table){
  return table.dataset.headerRow==='true'||(table.dataset.headerRow===undefined&&
   [...table.rows[0].cells].every(cell=>cell.tagName==='TH'));
 }

 function firstMovableIndex(table,axis){
  return Number(axis==='row'?hasHeaderRow(table):table.dataset.headerColumn==='true');
 }

 function canMoveAxis(table,axis,from){
  const length=axis==='row'?table.rows.length:table.rows[0].cells.length;
  const first=firstMovableIndex(table,axis);
  return from>=first&&length-first>1;
 }

 function canUseTableAction(table,cell,action){
  if(action==='header-row')return cell.parentElement.rowIndex===0;
  if(action==='header-column')return cell.cellIndex===0;
  if(action==='duplicate-table'||action==='delete-table')return true;
  if(!simpleTable(table))return false;
  const pinnedRow=cell.parentElement.rowIndex<firstMovableIndex(table,'row');
  const pinnedColumn=cell.cellIndex<firstMovableIndex(table,'column');
  if(action==='insert-row-above')return !pinnedRow;
  if(action==='insert-column-left')return !pinnedColumn;
  if(action==='delete-row')return !pinnedRow&&table.rows.length>1;
  if(action==='delete-column')return !pinnedColumn&&cell.parentElement.cells.length>1;
  return true;
 }

 function moveAxis(table,axis,from,to){
  if(from===to||!canMoveAxis(table,axis,from)||to<firstMovableIndex(table,axis))return;
  const rows=[...table.rows];
  if(axis==='column'){
   for(const row of rows){
    const cells=[...row.cells];
    row.insertBefore(cells[from],cells[to+(from<to?1:0)]||null);
   }
   const group=widthGroup(table);
   if(group){
    const columns=[...group.children];
    group.insertBefore(columns[from],columns[to+(from<to?1:0)]||null);
   }
   return;
  }
  // Preserve the number of row positions in each section, including pasted table headers.
  const sections=rows.map(row=>row.parentElement);
  const [moved]=rows.splice(from,1);
  rows.splice(to,0,moved);
  rows.forEach((row,index)=>sections[index].append(row));
 }

 function documentDropTarget(editor,y){
  const blocks=[...editor.children].map(node=>({node,rect:node.getBoundingClientRect()})).filter(block=>block.rect.height);
  if(!blocks.length)return null;
  let closest={before:blocks[0].node,y:blocks[0].rect.top};
  blocks.forEach(({rect},index)=>{
   const next=blocks[index+1];
   const edge=next?(rect.bottom+next.rect.top)/2:rect.bottom;
   if(Math.abs(y-edge)<Math.abs(y-closest.y))closest={before:next?.node||null,y:edge};
  });
  return closest;
 }

 export function attachTableControls(editor,scrollPort,controls,textSelection,listen){
  const options=controls.querySelector('[data-table-action=options]');
  const blockHandle=document.createElement('button');
  blockHandle.type='button';
  blockHandle.className='note-block-handle';
  blockHandle.title='拖动移动此块';
  blockHandle.setAttribute('aria-label','移动此块');
  blockHandle.hidden=true;
  controls.after(blockHandle);
  const menu=controls.querySelector('.note-table-menu');
  const addRow=controls.querySelector('[data-table-action=append-row]');
  const addColumn=controls.querySelector('[data-table-action=append-column]');
  const handles=[...controls.querySelectorAll('[data-table-axis]')];
  const outline=controls.querySelector('.note-table-outline');
  const guide=controls.querySelector('.note-table-resize-guide');
  const preview=controls.querySelector('.note-table-drag-preview');
  const buttons=new Map([...menu.querySelectorAll('[data-table-action]')].map(button=>[button.dataset.tableAction,button]));
  let cell,table,hoverCell,menuAnchor,pendingDelete,drag,reorder,ignoreHandleClick;
  let textDrag,selectionFrame,tableDrag,ignoreOptionsClick;
  let outlinedCell=null, hoveredBlock=null, hoveredFirstLine=null, pointer;

  function placeHandleInHeader(handle,target){
   const parent=target||controls;
   if(handle.parentElement===parent)return;
   handle.classList.toggle('is-anchored',Boolean(target));
   if(target){
    handle.style.removeProperty('left');
    handle.style.removeProperty('top');
   }
   parent.append(handle);
  }

  function outlineCell(target){
   if(target===outlinedCell)return;
   outlinedCell?.classList.remove('note-table-cell-selected');
   outlinedCell=target;
   outlinedCell?.classList.add('note-table-cell-selected');
  }

  function visibleDocument(){
   const area=scrollPort.getBoundingClientRect();
   return {
    left:Math.max(0,area.left),top:Math.max(0,area.top),
    right:Math.min(innerWidth,area.left+scrollPort.clientWidth),
    bottom:Math.min(innerHeight,area.top+scrollPort.clientHeight),
   };
  }

  function hideBlockHandle(){
   hoveredBlock=null;
   hoveredFirstLine=null;
   blockHandle.hidden=true;
  }

  function textAtPointer(block,x,y){
   const walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT);
   const range=document.createRange();
   for(let node=walker.nextNode();node;node=walker.nextNode()){
    if(!node.data.trim())continue;
    range.selectNodeContents(node);
    for(const rect of range.getClientRects()){
     if(x>=rect.left&&x<rect.right&&y>=rect.top&&y<rect.bottom)return rect;
    }
   }
   return null;
  }

  function moveBlockHandle(event){
   const {clientX:x,clientY:y}=event;
   if(tableDrag||pointer?.x===x&&pointer?.y===y)return;
   pointer={x,y};
   const viewport=visibleDocument();
   const clipTop=viewport.top+(parseFloat(getComputedStyle(scrollPort).scrollPaddingTop)||0);
   if(event.buttons||x<viewport.left||x>=viewport.right||y<clipTop||y>=viewport.bottom){
    hideBlockHandle();
    return;
   }
   if(event.target===blockHandle)return;
   let block=event.target;
   while(block&&block.parentElement!==editor)block=block.parentElement;
   const hit=block&&!block.matches('table')&&textAtPointer(block,x,y);
   if(!hit){
    // Keep the handle reachable through the gutter next to the first line.
    if(hoveredFirstLine){
     const handle=blockHandle.getBoundingClientRect();
     if(x>=handle.left&&x<hoveredFirstLine.left&&y>=Math.min(handle.top,hoveredFirstLine.top)&&
      y<Math.max(handle.bottom,hoveredFirstLine.bottom))return;
    }
    hideBlockHandle();
    return;
   }
   const line=block.matches('ul,ol')?block.firstElementChild:block;
   const rect=line.getBoundingClientRect();
   const lineHeight=parseFloat(getComputedStyle(line).lineHeight)||rect.height;
   const firstLine={left:rect.left,top:rect.top,bottom:rect.top+lineHeight};
   // A clipped first line must not make the handle jump to a continuation line.
   if(firstLine.top<clipTop-.5||firstLine.bottom>viewport.bottom+.5){
    hideBlockHandle();
    return;
   }
   blockHandle.hidden=false;
   const left=editor.getBoundingClientRect().left-8-blockHandle.offsetWidth;
   const top=(firstLine.top+firstLine.bottom-blockHandle.offsetHeight)/2;
   const origin=blockHandle.offsetParent;
   if(!origin||left<viewport.left||clipTop+blockHandle.offsetHeight>viewport.bottom){
    hideBlockHandle();
    return;
   }
   const bounds=origin.getBoundingClientRect();
   blockHandle.style.left=left-bounds.left+'px';
   blockHandle.style.top=top-bounds.top+'px';
   hoveredBlock=block;
   hoveredFirstLine=firstLine;
  }

  listen(scrollPort,'pointermove',moveBlockHandle);
  listen(scrollPort,'pointerleave',()=>{
   pointer=null;
   if(!tableDrag)hideBlockHandle();
  });
  listen(document,'keydown',()=>{if(!tableDrag)hideBlockHandle()},true);
  listen(window,'blur',()=>{if(!tableDrag)hideBlockHandle()});
  listen(blockHandle,'mousedown',event=>event.preventDefault());

  function visibleCellTop(target, top){
   const grid=target?.closest('table');
   const header=grid?.rows[0];
   return header&&target.parentElement!==header&&hasHeaderRow(grid)
    ?Math.max(top,header.getBoundingClientRect().bottom):top;
  }

  function scheduleTextSelection(){
   if(selectionFrame!==undefined)return;
   selectionFrame=requestAnimationFrame(()=>{
    selectionFrame=undefined;
    const selection=getSelection();
    const highlights=[];
    let paintsTextSelection=false;
    if(selection.rangeCount&&!selection.isCollapsed&&menuAnchor!==options){
     const range=selection.getRangeAt(0);
     if(editor.contains(range.commonAncestorContainer)){
      paintsTextSelection=true;
      const viewport=visibleDocument();
      const gutter=parseFloat(getComputedStyle(scrollPort).scrollPaddingTop)||0;
      const walker=document.createTreeWalker(range.commonAncestorContainer,NodeFilter.SHOW_TEXT);
      const piece=document.createRange();
      let node=walker.root.nodeType===Node.TEXT_NODE?walker.root:walker.nextNode();
      for(;node;node=walker.nextNode()){
       if(!range.intersectsNode(node)||!node.length)continue;
       const topLimit=visibleCellTop(node.parentElement.closest('td,th'),viewport.top+gutter);
       const start=node===range.startContainer?range.startOffset:0;
       const end=node===range.endContainer?range.endOffset:node.length;
       for(const match of node.data.slice(start,end).matchAll(/[^\s\u200B-\u200D\u2060\uFEFF]+/gu)){
        const offset=start+match.index;
        piece.setStart(node,offset);
        piece.setEnd(node,offset+match[0].length);
        for(const rect of piece.getClientRects()){
         const left=Math.max(rect.left,viewport.left),top=Math.max(rect.top,topLimit);
         const right=Math.min(rect.right,viewport.right),bottom=Math.min(rect.bottom,viewport.bottom);
         if(right<=left||bottom<=top)continue;
         const mark=document.createElement('span');
         Object.assign(mark.style,{left:left+'px',top:top+'px',width:right-left+'px',height:bottom-top+'px'});
         highlights.push(mark);
        }
       }
      }
     }
    }
    textSelection.replaceChildren(...highlights);
    editor.classList.toggle('note-text-selection-painted',paintsTextSelection);
   });
  }

  function textCaret(event){
   const position=document.caretPositionFromPoint?.(event.clientX,event.clientY);
   if(position)return {node:position.offsetNode,offset:position.offset};
   const range=document.caretRangeFromPoint?.(event.clientX,event.clientY);
   return range?{node:range.startContainer,offset:range.startOffset}:null;
  }

  listen(editor,'mousedown',event=>{
   if(event.button===0&&event.detail===2&&event.target.closest('td,th')){
    event.preventDefault();
   }
  });
  listen(editor,'dblclick',event=>{
   if(event.target.closest('td,th'))event.preventDefault();
  });
  listen(editor,'pointerdown',event=>{
   textDrag=null;
   if(event.button!==0||event.shiftKey||drag||reorder||tableDrag)return;
   const startCell=event.target.closest('td,th');
   if(!startCell)return;
   const start=textCaret(event);
   if(startCell?.contains(start?.node))textDrag={...start,cell:startCell,id:event.pointerId,active:false};
  });
  listen(document,'mousemove',event=>{
   if(!textDrag||!(event.buttons&1)||drag||reorder||tableDrag||!editor.contains(textDrag.node))return;
   const end=textCaret(event);
   if(!end||!editor.contains(end.node))return;
   if(!textDrag.active&&textDrag.cell.contains(end.node))return;
   event.preventDefault();
   textDrag.active=true;
   getSelection().setBaseAndExtent(textDrag.node,textDrag.offset,end.node,end.offset);
   scheduleTextSelection();
  },true);
  for(const type of ['pointerup','pointercancel'])listen(document,type,event=>{
   if(textDrag?.id===event.pointerId)textDrag=null;
  },true);

  function cancelDelete(){
   if(!pendingDelete)return;
   pendingDelete.button.textContent=pendingDelete.label;
   pendingDelete=null;
  }
  function closeMenu(){
   if(menuAnchor===options){
    if(cell&&editor.contains(cell)){
     const selection=getSelection();
     if(selection.rangeCount&&!selection.isCollapsed)selection.collapse(cell,0);
    }
    editor.classList.remove('note-table-selected');
   }
   menu.hidden=true;
   menuAnchor?.setAttribute('aria-expanded','false');
   menuAnchor=null;
   cancelDelete();
   scheduleTextSelection();
  }
  function openMenu(anchor){
   if(menuAnchor===anchor){closeMenu();position();return}
   closeMenu();
   menuAnchor=anchor;
   anchor.setAttribute('aria-expanded','true');
   menu.hidden=false;
   const axis=anchor.dataset.tableAxis;
   for(const [action,button] of buttons){
    const actionAxis=action.includes('-row')?'row':action.includes('-column')?'column':null;
    button.hidden=(axis||null)!==actionAxis||(action.startsWith('header-')&&!canUseTableAction(table,cell,action));
   }
   if(anchor===options){
    editor.classList.add('note-table-selected');
    const range=document.createRange();
    range.selectNode(table);
    const selection=getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
   }
   position();
   scheduleTextSelection();
   menu.querySelector('button:not([hidden]):not(:disabled)')?.focus({preventScroll:true});
  }
  function activate(next){
   const candidate=next?.closest('table');
   const active=candidate&&editor.contains(candidate)&&candidate.rows.length?candidate:null;
   if(table!==active||cell!==next)closeMenu();
   table=active;
   cell=active?next:null;
   position();
  }
  function position(){
   if(tableDrag?.active){showTableDrag();return}
   if(!table||!editor.contains(table)||!editor.getClientRects().length){
    for(const handle of handles)placeHandleInHeader(handle,null);
    outlineCell(null);
    controls.hidden=true;
    return;
   }
   const bounds=table.getBoundingClientRect();
   const viewport=visibleDocument();
   const left=Math.max(bounds.left,viewport.left);
   const right=Math.min(bounds.right,viewport.right);
   const top=Math.max(bounds.top,viewport.top);
   const bottom=Math.min(bounds.bottom,viewport.bottom);
   controls.hidden=right-left<32||bottom-top<24;
   if(controls.hidden){
    for(const handle of handles)handle.hidden=true;
    outlineCell(null);
    closeMenu();
    return;
   }
   const origin=controls.getBoundingClientRect();
   const place=(element,x,y)=>{
    element.style.left=x-origin.left+'px';
    element.style.top=y-origin.top+'px';
   };
   const buttonGap=8,buttonSize=23;
   const centerX=(bounds.left+bounds.right-buttonSize)/2;
   const centerY=(bounds.top+bounds.bottom-buttonSize)/2;
   const optionsX=bounds.left-buttonSize-buttonGap;
   options.hidden=bounds.top<top||optionsX<viewport.left;
   if(options.hidden&&menuAnchor===options)closeMenu();
   addRow.hidden=bounds.bottom+buttonGap+buttonSize>viewport.bottom||centerX<left||centerX+buttonSize>right;
   addColumn.hidden=bounds.right+buttonGap+buttonSize>viewport.right||centerY<top||centerY+buttonSize>bottom;
   place(options,optionsX,bounds.top+2);
   place(addRow,centerX,bounds.bottom+buttonGap);
   place(addColumn,bounds.right+buttonGap,centerY);
   const canChange=simpleTable(table);
   for(const button of [addRow,addColumn,...menu.querySelectorAll('[data-table-action^="insert-"]')])button.disabled=!canChange;
   const wholeTable=menuAnchor===options;
   const edgeCell=hoverCell?.closest('table')===table&&!menuAnchor&&!reorder?hoverCell:cell;
   const row=table.rows[edgeCell.parentElement.rowIndex];
   const column=table.rows[0].cells[edgeCell.cellIndex];
   const pinnedHeader=hasHeaderRow(table);
   for(const handle of handles){
    const isColumn=handle.dataset.tableAxis==='column';
    const edgeCell=isColumn?column:row.cells[0];
    const edge=edgeCell?.getBoundingClientRect();
    const anchored=canChange&&pinnedHeader&&(isColumn||row.rowIndex===0);
    const x=edge?(isColumn?(edge.left+edge.right)/2:edge.left+.5):bounds.left;
    const y=edge?(isColumn?edge.top+.5:(edge.top+edge.bottom)/2):bounds.top;
    const handleTop=isColumn?top:visibleCellTop(row.cells[0],top);
    handle.hidden=wholeTable||!canChange||!edge||x<left-1||x>right||y<handleTop||y>bottom;
    handle.classList.toggle('can-reorder',canChange&&canMoveAxis(table,handle.dataset.tableAxis,isColumn?edgeCell.cellIndex:row.rowIndex));
    if(reorder?.handle!==handle)placeHandleInHeader(handle,anchored?edgeCell:null);
    if(!anchored)place(handle,x,y);
   }
   if(menuAnchor?.hidden)closeMenu();
   outlineCell(wholeTable||reorder?.active||getSelection()?.isCollapsed===false?null:cell);
   outline.hidden=!wholeTable;
   if(wholeTable){
    place(outline,left,top);
    outline.style.width=right-left+'px';
    outline.style.height=bottom-top+'px';
   }
   for(const [action,button] of buttons)button.disabled=!canUseTableAction(table,cell,action);
   buttons.get('header-row').setAttribute('aria-pressed',String(hasHeaderRow(table)));
   buttons.get('header-column').setAttribute('aria-pressed',String(table.dataset.headerColumn==='true'));
   if(menuAnchor){
    const anchor=menuAnchor.getBoundingClientRect();
    const menuLeft=Math.max(8,Math.min(anchor.left,innerWidth-menu.offsetWidth-8));
    const below=innerHeight-anchor.bottom-8,above=anchor.top-8;
    const opensUp=menu.scrollHeight>below&&above>below;
    menu.style.maxHeight=Math.max(0,opensUp?above:below)+'px';
    menu.style.left=menuLeft+'px';
    menu.style.top=(opensUp?anchor.top-menu.offsetHeight-4:anchor.bottom+4)+'px';
   }
   if(reorder?.active)showReorder();
  }

  listen(document,'selectionchange',()=>{
   scheduleTextSelection();
   if(menuAnchor||reorder||drag||tableDrag)return;
   const anchor=getSelection().anchorNode;
   const element=anchor?.nodeType===1?anchor:anchor?.parentElement;
   if(element&&editor.contains(element))activate(element.closest('td,th'));
  });
  listen(document,'pointerdown',event=>{
   if(!tableDrag&&event.target!==blockHandle)hideBlockHandle();
   if(controls.contains(event.target)||event.target===blockHandle||event.target.closest('.note-table-handle')||tableDrag)return;
   closeMenu();
   hoverCell=null;
   if(editor.contains(event.target))activate(event.target.closest('td,th'));
   else activate(null);
  });
  function refreshLayout(){
   if(!tableDrag)hideBlockHandle();
   position();
   scheduleTextSelection();
  }
  listen(document,'scroll',refreshLayout,true);
  listen(window,'resize',refreshLayout);
  listen(editor,'input',()=>{
   if(!tableDrag)hideBlockHandle();
   textDrag=null;
   scheduleTextSelection();
   if(!cell||!editor.contains(cell))activate(null);
   else position();
  });
  function columnEdge(event){
   const target=event.target.closest('th,td');
   const targetTable=target?.closest('table');
   if(!targetTable||!editor.contains(targetTable))return null;
   const bounds=target.getBoundingClientRect();
   if(Math.abs(event.clientX-bounds.right)<=5)return target;
   if(Math.abs(event.clientX-bounds.left)<=5)return target.previousElementSibling;
   return null;
  }
  const dragThreshold=5;
  function restoreResize(current){
   widthGroup(current.table)?.remove();
   for(const {group,next} of current.originalGroups.reverse())current.table.insertBefore(group,next);
   current.table.style.width=current.originalWidth;
  }
  function moveResize(event){
   if(!drag){
    if(textDrag&&(event.buttons&1)||event.target.closest('.note-table-handle'))return;
    const target=event.target.closest('td,th');
    const bounds=target?.getBoundingClientRect();
    const edgeTarget=target&&(target.parentElement.rowIndex===0&&Math.abs(event.clientY-bounds.top)<=10||
     target.cellIndex===0&&Math.abs(event.clientX-bounds.left)<=10)?target:null;
    const edge=columnEdge(event);
    const resizable=Boolean(edge&&simpleTable(edge.closest('table')));
    if(!menuAnchor&&!resizable&&hoverCell!==edgeTarget){
     hoverCell=edgeTarget;
     if(edgeTarget&&edgeTarget.closest('table')!==table)activate(edgeTarget);
     else position();
    }
    editor.classList.toggle('note-column-resizing',resizable);
    return;
   }
   if(drag.pointerId!==event.pointerId)return;
   const distance=Math.round(event.clientX-drag.start);
   if(!drag.active){
    if(Math.abs(distance)<dragThreshold)return;
    const {edge}=drag;
    drag.widths=Array.from(edge.parentElement.cells,column=>Math.max(minimumWidth,Math.round(column.getBoundingClientRect().width)));
    drag.originalWidth=drag.table.style.width;
    drag.originalGroups=Array.from(drag.table.querySelectorAll(':scope > colgroup'),group=>({group,next:group.nextSibling}));
    for(const {group} of drag.originalGroups)group.remove();
    writeColumnWidths(drag.table,drag.widths);
    drag.column=widthGroup(drag.table).children[drag.index];
    drag.total=drag.widths.reduce((total,width)=>total+width,0);
    drag.active=true;
    editor.classList.add('note-column-resize-preview');
    closeMenu();
    hoverCell=null;
   }
   const width=drag.widths[drag.index];
   drag.delta=Math.max(minimumWidth-width,Math.min(Math.max(0,2400-width),distance));
   drag.column.style.width=width+drag.delta+'px';
   drag.table.style.width=drag.total+drag.delta+'px';
   position();
   scheduleTextSelection();
  }
  function finishResize(event){
   if(!drag||event.pointerId!==drag.pointerId)return;
   if(event.type==='pointerup'&&drag.active)moveResize(event);
   const current=drag;
   drag=null;
   editor.classList.remove('note-column-resizing','note-column-resize-preview');
   if(!current.active)return;
   if(event.type==='pointerup'&&current.delta&&editor.contains(current.table)){
    editor.dispatchEvent(new Event('input',{bubbles:true}));
   }else{
    restoreResize(current);
    position();
    scheduleTextSelection();
   }
  }
  listen(editor,'pointermove',moveResize);
  listen(editor,'pointerleave',()=>{
   if(!drag)editor.classList.remove('note-column-resizing');
  });
  listen(editor,'pointerdown',event=>{
   if(event.button!==0||drag||reorder||tableDrag)return;
   const edge=columnEdge(event);
   const targetTable=edge?.closest('table');
   if(!targetTable||!simpleTable(targetTable))return;
   textDrag=null;
   event.preventDefault();
   event.stopPropagation();
   drag={
    table:targetTable,index:edge.cellIndex,pointerId:event.pointerId,start:event.clientX,edge,delta:0,active:false
   };
   editor.classList.add('note-column-resizing');
   editor.setPointerCapture(event.pointerId);
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(editor,type,finishResize);
  function showTableDrag(){
   const {x,y,source,copy,offsetX,offsetY}=tableDrag;
   const {left,top,right,bottom}=visibleDocument();
   Object.assign(preview.style,{left:left+'px',top:top+'px',width:Math.max(0,right-left)+'px',height:Math.max(0,bottom-top)+'px'});
   copy.style.left=x-offsetX-left+'px';
   copy.style.top=y-offsetY-top+'px';
   const target=x>=left-40&&x<=right&&y>=top&&y<=bottom?documentDropTarget(editor,y):null;
   const following=source.nextElementSibling;
   tableDrag.target=target&&target.before!==source&&
    (source.parentElement!==editor||target.before!==following)&&target.y>=top&&target.y<=bottom?target:null;
   guide.hidden=!tableDrag.target;
   if(tableDrag.target){
    Object.assign(guide.style,{left:left+'px',top:target.y+'px',width:right-left+'px',height:'2px'});
   }
  }
  function scrollTableDrag(){
   if(!tableDrag?.active)return;
   for(let scroller=scrollPort;scroller;scroller=scroller.parentElement){
    if(scroller.scrollHeight<=scroller.clientHeight||
     (scroller!==document.scrollingElement&&!/auto|scroll/.test(getComputedStyle(scroller).overflowY)))continue;
    const rect=scroller.getBoundingClientRect();
    const top=Math.max(0,rect.top),bottom=Math.min(innerHeight,rect.bottom);
    const y=tableDrag.y;
    const distance=y<top+32?Math.max(-16,(y-top-32)/2):y>bottom-32?Math.min(16,(y-bottom+32)/2):0;
    if(!distance)continue;
    const previous=scroller.scrollTop;
    scroller.scrollTop+=distance;
    if(previous!==scroller.scrollTop){showTableDrag();break}
   }
   tableDrag.frame=requestAnimationFrame(scrollTableDrag);
  }
  function finishTableDrag(event){
   if(!tableDrag||tableDrag.id!==event.pointerId)return;
   if(event.type==='pointerup'&&tableDrag.active){
    tableDrag.x=event.clientX;
    tableDrag.y=event.clientY;
    showTableDrag();
   }
   const {active,source,target,frame,id,handle}=tableDrag;
   tableDrag=null;
   if(handle.hasPointerCapture(id))handle.releasePointerCapture(id);
   if(!active)return;
   cancelAnimationFrame(frame);
   if(handle===options)ignoreOptionsClick=true;
   source.classList.remove('note-table-drag-source');
   controls.classList.remove('is-moving-table');
   blockHandle.classList.remove('is-moving-block');
   hideBlockHandle();
   preview.classList.remove('note-document');
   preview.hidden=true;
   preview.replaceChildren();
   guide.hidden=true;
   guide.style.width='';
   if(event.type==='pointerup'&&target){
    editor.insertBefore(source,target.before);
    editor.focus({preventScroll:true});
    const anchor=handle===options?cell:source.matches('ul,ol')?source.firstElementChild:source;
    if(anchor)getSelection().collapse(anchor,0);
    editor.dispatchEvent(new Event('input',{bubbles:true}));
   }
   position();
  }
  for(const handle of [options,blockHandle]){
   listen(handle,'pointerdown',event=>{
    const source=handle===options?table:hoveredBlock;
    if(event.button!==0||drag||reorder||tableDrag||!source||!editor.contains(source))return;
    ignoreOptionsClick=false;
    const bounds=source.getBoundingClientRect();
    tableDrag={id:event.pointerId,handle,source,startX:event.clientX,startY:event.clientY,
     offsetX:event.clientX-bounds.left,offsetY:event.clientY-bounds.top,width:bounds.width};
    handle.setPointerCapture(event.pointerId);
   });
   listen(handle,'pointermove',event=>{
    if(!tableDrag||tableDrag.id!==event.pointerId)return;
    const {clientX:x,clientY:y}=event;
    if(!tableDrag.active){
     if(Math.hypot(x-tableDrag.startX,y-tableDrag.startY)<dragThreshold)return;
     closeMenu();
     hoverCell=null;
     const source=tableDrag.source;
     const copy=source.matches('table')?copyTable(source):source.cloneNode(true);
     copy.classList.add('note-table-drag-copy');
     copy.style.width=tableDrag.width+'px';
     preview.classList.add('note-document');
     preview.replaceChildren(copy);
     controls.hidden=false;
     preview.hidden=false;
     source.classList.add('note-table-drag-source');
     controls.classList.add('is-moving-table');
     blockHandle.classList.add('is-moving-block');
     Object.assign(tableDrag,{active:true,copy});
     tableDrag.frame=requestAnimationFrame(scrollTableDrag);
    }
    Object.assign(tableDrag,{x,y});
    showTableDrag();
   });
   for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(handle,type,finishTableDrag);
  }
  listen(document,'keydown',event=>{
   if(event.key!=='Escape'||!tableDrag?.active)return;
   event.preventDefault();
   finishTableDrag({type:'pointercancel',pointerId:tableDrag.id});
  });
  function selectHandleCell(){
   if(hoverCell?.closest('table')===table){
    const target=hoverCell;
    hoverCell=null;
    activate(target);
   }
  }
  function showReorder(){
   const {axis,from,start,point,sources,copies,handle}=reorder;
   const across=axis==='column';
   const bounds=table.getBoundingClientRect();
   const {left,top,right,bottom}=visibleDocument();
   const delta=point-start;
   const sourceBoxes=sources.map(source=>source.getBoundingClientRect());
   const items=across?[...table.rows[0].cells]:[...table.rows];
   const center=box=>across?(box.left+box.right)/2:(box.top+box.bottom)/2;
   const boxes=items.map(item=>item.getBoundingClientRect());
   preview.style.left=left+'px';
   preview.style.top=top+'px';
   preview.style.width=Math.max(0,right-left)+'px';
   preview.style.height=Math.max(0,bottom-top)+'px';
   preview.hidden=false;
   handle.style.translate=across?delta+'px 0':'0 '+delta+'px';
   sourceBoxes.forEach((box,index)=>{
    const copy=copies[index];
    copy.style.left=box.left-left+(across?delta:0)+'px';
    copy.style.top=box.top-top+(across?0:delta)+'px';
    copy.style.width=box.width+'px';
    copy.style.height=box.height+'px';
   });

   let to=firstMovableIndex(table,axis);
   while(to+1<boxes.length&&point>(center(boxes[to])+center(boxes[to+1]))/2)to++;
   reorder.to=to;
   const target=boxes[to];
   const x=across?(to>from?target.right:target.left):Math.max(bounds.left,left);
   const y=across?Math.max(bounds.top,top):(to>from?target.bottom:target.top);
   guide.style.left=x+'px';
   guide.style.top=y+'px';
   guide.style.width=(across?2:Math.max(0,Math.min(bounds.right,right)-x))+'px';
   guide.style.height=(across?Math.max(0,Math.min(bounds.bottom,bottom)-y):2)+'px';
   guide.hidden=to===from||(across?(x<left||x>right):(y<top||y>bottom));
  }
  for(const handle of handles){
   handle.contentEditable='false';
   listen(handle,'mousedown',event=>event.preventDefault());
   listen(handle,'pointerdown',event=>{
    event.stopPropagation();
    if(event.button!==0||drag||reorder||tableDrag||!cell||!simpleTable(table))return;
    ignoreHandleClick=false;
    const sourceCell=hoverCell?.closest('table')===table?hoverCell:cell;
    const axis=handle.dataset.tableAxis;
    const from=axis==='column'?sourceCell.cellIndex:sourceCell.parentElement.rowIndex;
    if(!canMoveAxis(table,axis,from))return;
    reorder={axis,from,to:from,start:axis==='column'?event.clientX:event.clientY,id:event.pointerId,active:false,handle,sourceCell,previousCell:cell};
    handle.setPointerCapture(event.pointerId);
   });
   listen(handle,'pointermove',event=>{
    if(!reorder||reorder.id!==event.pointerId)return;
    const across=reorder.axis==='column';
    const point=across?event.clientX:event.clientY;
    if(!reorder.active&&Math.abs(point-reorder.start)<dragThreshold)return;
    if(!reorder.active){
     closeMenu();
     cell=reorder.sourceCell;
     hoverCell=null;
     const sources=across?Array.from(table.rows,row=>row.cells[reorder.from]):[...table.rows[reorder.from].cells];
     const copies=sources.map(source=>{
      const copy=document.createElement('div');
      const style=getComputedStyle(source);
      copy.className='note-table-drag-cell';
      copy.style.fontWeight=style.fontWeight;
      if(style.backgroundColor!=='rgba(0, 0, 0, 0)')copy.style.backgroundColor=style.backgroundColor;
      for(const node of source.childNodes)if(!handles.includes(node))copy.append(node.cloneNode(true));
      source.classList.add('note-table-drag-source');
      return copy;
     });
     preview.replaceChildren(...copies);
     outline.hidden=true;
     Object.assign(reorder,{active:true,sources,copies,point});
     position();
     return;
    }
    reorder.point=point;
    showReorder();
   });
   for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(handle,type,event=>{
    if(!reorder||reorder.id!==event.pointerId)return;
    if(event.type==='pointerup'&&reorder.active){
     reorder.point=reorder.axis==='column'?event.clientX:event.clientY;
     showReorder();
    }
    const {axis,from,to,active,sources,previousCell}=reorder;
    reorder=null;
    guide.hidden=true;
    guide.style.width='';
    handle.style.translate='';
    preview.hidden=true;
    preview.replaceChildren();
    sources?.forEach(source=>source.classList.remove('note-table-drag-source'));
    ignoreHandleClick=active;
    if(event.type!=='pointerup'||!active||from===to){cell=previousCell;position();return}
    moveAxis(table,axis,from,to);
    editor.focus({preventScroll:true});
    getSelection().collapse(cell,0);
    position();
    editor.dispatchEvent(new Event('input',{bubbles:true}));
   });
   listen(handle,'click',event=>{
    event.stopPropagation();
    if(ignoreHandleClick&&event.detail!==0)return;
    selectHandleCell();
    openMenu(handle);
   });
  }
  listen(editor,'keydown',event=>{
   if(!table||!event.altKey||event.key!=='ArrowDown')return;
   event.preventDefault();
   (handles.find(handle=>!handle.hidden)||options).focus();
  });
  function closeMenuOnEscape(event){
   if(event.key!=='Escape')return;
   event.preventDefault();
   const anchor=menuAnchor;
   closeMenu();
   position();
   anchor?.focus();
  }
  listen(controls,'keydown',closeMenuOnEscape);
  for(const handle of handles)listen(handle,'keydown',event=>{
   if(handle.classList.contains('is-anchored'))closeMenuOnEscape(event);
  });
  listen(controls,'mousedown',event=>event.preventDefault());
  listen(controls,'click',event=>{
   const button=event.target.closest('[data-table-action]');
   if(!button||button.disabled||!cell||!editor.contains(cell))return;
   const action=button.dataset.tableAction;
   if(action==='options'){
    if(!ignoreOptionsClick||event.detail===0)openMenu(options);
    return;
   }
   if(!canUseTableAction(table,cell,action))return;
   if(action.startsWith('delete-')&&pendingDelete?.button!==button){
    cancelDelete();
    pendingDelete={button,label:button.textContent};
    button.textContent='确认'+button.textContent;
    return;
   }
   const next=changeTable(table,cell,action);
   closeMenu();
   editor.focus({preventScroll:true});
   getSelection().collapse(next,0);
   activate(next);
   editor.dispatchEvent(new Event('input',{bubbles:true}));
  });
  return ()=>{
   if(drag)finishResize({type:'pointercancel',pointerId:drag.pointerId});
   if(tableDrag)finishTableDrag({type:'pointercancel',pointerId:tableDrag.id});
   cancelAnimationFrame(selectionFrame);
   selectionFrame=undefined;
  };
 }
