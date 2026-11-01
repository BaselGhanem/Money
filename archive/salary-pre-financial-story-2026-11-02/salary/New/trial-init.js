(()=>{`use strict`;
const target=`salary_manager_v2_new`;
try{const first=!localStorage.getItem(target);if(first){const raw=localStorage.getItem(`salary_manager_v2`);if(raw){const copy=JSON.parse(raw);if(copy?.months){copy.settings||={};copy.settings.trialImportedAt=new Date().toISOString();localStorage.setItem(target,JSON.stringify(copy))}}if(localStorage.getItem(`salary_manager_remembered`)===`1`)localStorage.setItem(`salary_manager_remembered_new`,`1`);if(sessionStorage.getItem(`salary_manager_unlocked`)===`1`)sessionStorage.setItem(`salary_manager_unlocked_new`,`1`)}}catch(error){console.warn(`Trial data initialization unavailable`,error)}
})();
