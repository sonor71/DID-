/** Transactional, bounded history for serializable editor state. */
export class HistoryManager {
  #past=[];
  #future=[];
  #transaction=null;
  constructor({limit=100,apply=()=>{}}={}){this.limit=limit;this.apply=apply;}
  begin(snapshot,label='change'){if(!this.#transaction)this.#transaction={before:structuredClone(snapshot),label};}
  commit(snapshot){
    if(!this.#transaction)return false;
    const entry={...this.#transaction,after:structuredClone(snapshot)};this.#transaction=null;
    if(JSON.stringify(entry.before)===JSON.stringify(entry.after))return false;
    this.#past.push(entry);if(this.#past.length>this.limit)this.#past.shift();this.#future=[];return true;
  }
  cancel(){this.#transaction=null;}
  record(before,after,label='change'){this.begin(before,label);return this.commit(after);}
  undo(){const entry=this.#past.pop();if(!entry)return false;this.#future.push(entry);this.apply(structuredClone(entry.before),entry.label);return true;}
  redo(){const entry=this.#future.pop();if(!entry)return false;this.#past.push(entry);this.apply(structuredClone(entry.after),entry.label);return true;}
  clear(){this.#past=[];this.#future=[];this.#transaction=null;}
  get canUndo(){return this.#past.length>0;}
  get canRedo(){return this.#future.length>0;}
}
