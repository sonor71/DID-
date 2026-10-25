import {HistoryManager} from './HistoryManager.js';

/** Owns Book Studio history while the legacy shell remains responsible for routing. */
export function createEditorRoot({readSnapshot,applySnapshot,onChange}){
  const history=new HistoryManager({apply:snapshot=>{applySnapshot(snapshot);onChange?.('history');}});
  return {
    history,
    begin(label){history.begin(readSnapshot(),label);},
    commit(){const changed=history.commit(readSnapshot());if(changed)onChange?.('commit');return changed;},
    record(label,mutate){const before=readSnapshot();mutate();const changed=history.record(before,readSnapshot(),label);if(changed)onChange?.('commit');return changed;},
    undo(){return history.undo();},
    redo(){return history.redo();}
  };
}
