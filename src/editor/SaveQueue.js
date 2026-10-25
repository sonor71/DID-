/** Serialize editor writes, forwarding each error to its caller while allowing retry. */
export class SaveQueue {
  #tail=Promise.resolve();
  run(write){
    const result=this.#tail.then(write);
    this.#tail=result.then(()=>undefined,()=>undefined);
    return result;
  }
}
