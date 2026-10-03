// Read-only P03 milestone derivation from the real leading native ledger.
// A dispatch promise is never silently promoted to a customer-receipt promise.
export function readPan517DeliveryMilestones(state,binding,asOf=null){
  const f=state.fulfilment,cutoffAt=asOf??state.events.at(-1)?.effectiveAt??null;
  function metric(kind,events){
    const original=f.promises.find(p=>p.kind===kind),observedQuantity=events.reduce((sum,e)=>sum+e.quantity,0);
    const identity={eventType:kind,promiseKind:original?.kind??null,originalPromiseRevision:original?.revision??null,originalDueAt:original?.dueAt??null,originalPromiseDigest:original?.promiseDigest??null,observedQuantity,cutoffAt};
    if(!events.length)return {...identity,status:'UNKNOWN_NO_'+kind+'_EVIDENCE',onTimeQuantity:null,positionOtif:null,completion:'UNCONFIRMED'};
    if(!original)return {...identity,status:'UNKNOWN_NO_'+kind+'_PROMISE',onTimeQuantity:null,positionOtif:null,completion:observedQuantity===binding.orderQuantity?'COMPLETE':'PARTIAL'};
    const onTimeQuantity=events.filter(e=>Date.parse(e.effectiveAt)<=Date.parse(original.dueAt)).reduce((sum,e)=>sum+e.quantity,0),complete=observedQuantity===binding.orderQuantity,late=onTimeQuantity<observedQuantity;
    return {...identity,status:late?'LATE':complete?'ON_TIME':'PARTIAL_ON_TIME_QUANTITY',onTimeQuantity,positionOtif:complete?onTimeQuantity===binding.orderQuantity:cutoffAt!==null&&Date.parse(cutoffAt)>Date.parse(original.dueAt)?false:null,completion:complete?'COMPLETE':'PARTIAL'};
  }
  return {schemaVersion:'pansphaira.pan517/delivery-milestones/v1',dispatch:metric('DISPATCH',f.deliveryNotes),customerReceipt:metric('CUSTOMER_RECEIPT',f.customerReceipts),evidenceClass:'ACTUAL_LOCAL_SYNTHETIC_NATIVE_LEDGER_NOT_PRODUCTIVE_PHYSICAL_OR_CUSTOMER_IDENTITY',readOnly:true};
}
