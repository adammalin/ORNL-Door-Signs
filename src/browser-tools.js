import { SIZES, validateDesign, patchDesign, filterGallery } from './model.js';
import { TUTORIAL_STEPS } from './tutorial.js';

export function registerBrowserTools(api) {
  const registry=document.modelContext||navigator.modelContext;
  if(typeof registry?.registerTool!=='function')return ()=>{};
  const lifecycle=new AbortController();
  const string={type:'string'},number={type:'number'};
  const patchProperties={organization:string,title:string,subtitle:string,showSubtitle:{type:'boolean'},showImage:{type:'boolean'},entries:{type:'array',maxItems:12,items:{type:'object',properties:{name:string,subname:string,style:{enum:['primary','standard','assistant'],type:'string'},align:{enum:['left','right'],type:'string'}},required:['name','subname'],additionalProperties:false}},details:string,room:string,sizeId:string,imageId:{type:['string','null']},titleSize:number,crop:{type:'object',properties:{x:number,y:number,zoom:number},additionalProperties:false}};
  const schema=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
  const tool=(name,description,inputSchema,execute,readOnly=false)=>{
    const handler=async args=>{
      try{
        if(!args||typeof args!=='object'||Array.isArray(args))throw new Error('Arguments must be an object.');
        for(const key of Object.keys(args))if(!Object.hasOwn(inputSchema.properties,key))throw new Error(`Unknown property: ${key}`);
        return {content:[{type:'text',text:JSON.stringify(await execute(args))}]};
      }catch(error){return {isError:true,content:[{type:'text',text:error.message}]};}
    };
    Promise.resolve(registry.registerTool({name,description,inputSchema,execute:handler,annotations:{readOnlyHint:readOnly,untrustedContentHint:true}},{signal:lifecycle.signal})).catch(()=>{});
  };
  const update=async patch=>{
    if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new Error('A design patch is required.');
    for(const key of Object.keys(patch))if(!Object.hasOwn(patchProperties,key))throw new Error(`Unknown design control: ${key}`);
    const current=api.getDesign();
    const next=patchDesign(current,patch,api.getGallery());
    await api.setDesign(next);return api.getState();
  };
  tool('door_sign_get_state','Read the visible door sign, print checks, gallery filters and tutorial state.',schema(),()=>api.getState(),true);
  tool('door_sign_list_templates','List supported sign sizes and print resolution.',schema(),()=>({templates:SIZES}),true);
  tool('door_sign_search_images','Search the approved gallery using Canto keywords and descriptions, category and science area.',schema({query:string,category:string,scienceArea:string,limit:{type:'integer',minimum:1,maximum:100}}),({query='',category='',scienceArea='',limit=24})=>{
    if(![query,category,scienceArea].every(v=>typeof v==='string')||!Number.isInteger(limit)||limit<1||limit>100)throw new Error('Invalid gallery search.');
    const found=filterGallery(api.getGallery(),query,category,scienceArea);return {total:found.length,images:found.slice(0,limit)};
  },true);
  tool('door_sign_set_gallery_filters','Set the visible gallery search, category and science-area filters.',schema({query:string,category:string,scienceArea:string}),args=>{
    if(!Object.values(args).every(v=>typeof v==='string'))throw new Error('Filters must be strings.');api.setFilters(args);return api.getState();
  });
  tool('door_sign_update','Edit any visible design control, including all text, template, subtitle/image visibility, name entries and their order/style/alignment, title size, approved image and crop.',schema({patch:schema(patchProperties)},['patch']),({patch})=>update(patch));
  tool('door_sign_select_image','Select one approved image and apply its recommended crop.',schema({imageId:string},['imageId']),({imageId})=>{
    const image=api.getGallery().find(i=>i.id===imageId&&i.approved===true);if(!image)throw new Error('Unknown approved image ID.');return update({imageId,crop:image.defaultCrop||{x:50,y:50,zoom:1}});
  });
  tool('door_sign_reset_crop','Reset photo framing to centered cover at 1×.',schema(),()=>update({crop:{x:50,y:50,zoom:1}}));
  tool('door_sign_new_design','Start a new sign while retaining the previous draft in Undo.',schema(),async()=>{api.newDesign();await api.render();return api.getState();});
  tool('door_sign_undo','Undo the last visible edit.',schema(),async()=>{api.undo();await api.render();return api.getState();});
  tool('door_sign_redo','Redo the last undone edit.',schema(),async()=>{api.redo();await api.render();return api.getState();});
  tool('door_sign_import_json','Open an editable saved sign JSON document; invalid content leaves the visible sign unchanged.',schema({document:{type:'object'}},['document']),async({document})=>{await api.setDesign(validateDesign(document,api.getGallery()));return api.getState();});
  tool('door_sign_save_json','Prepare a downloadable editable JSON document and return its content.',schema(),()=>{api.saveJson();return {document:api.getDesign(),...api.getDownload()};});
  tool('door_sign_export','Prepare a 300-dpi PNG or exact-size PDF using the visible print checks. Returns a visible save link.',schema({format:{type:'string',enum:['png','pdf']}},['format']),async({format})=>{
    if(!['png','pdf'].includes(format))throw new Error('Choose png or pdf.');return api.export(format);
  });
  tool('door_sign_tutorial','Start, navigate or close the user walkthrough.',schema({action:{type:'string',enum:['start','next','back','close']},step:{type:'integer',minimum:0,maximum:TUTORIAL_STEPS.length-1}},['action']),({action,step=0})=>{
    if(!['start','next','back','close'].includes(action))throw new Error('Invalid tutorial action.');
    if(action==='start')api.tutorial.start({step});else api.tutorial[action]();return api.tutorial.getState();
  });
  return ()=>lifecycle.abort();
}
