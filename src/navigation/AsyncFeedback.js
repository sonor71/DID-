/** Keep duplicate submissions out while exposing progress to assistive technology. */
export async function withBusy(control,operation){
  if(control?.getAttribute('aria-busy')==='true')return;
  const disabled=control?.disabled;
  if(control){control.setAttribute('aria-busy','true');control.disabled=true;}
  try{return await operation();}
  finally{if(control){control.removeAttribute('aria-busy');control.disabled=disabled;}}
}
