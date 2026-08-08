export type ZipFile={name:string;data:Uint8Array|string;modifiedAt?:Date};

const encoder=new TextEncoder();
const crcTable=(()=>{const table=new Uint32Array(256);for(let index=0;index<256;index++){let value=index;for(let bit=0;bit<8;bit++)value=(value&1)?0xedb88320^(value>>>1):value>>>1;table[index]=value>>>0;}return table;})();

export function crc32(data:Uint8Array){let crc=0xffffffff;for(const byte of data)crc=crcTable[(crc^byte)&0xff]^(crc>>>8);return (crc^0xffffffff)>>>0;}
function dosDateTime(date:Date){const year=Math.max(1980,date.getFullYear());return {time:(date.getHours()<<11)|(date.getMinutes()<<5)|(date.getSeconds()>>1),date:((year-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate()};}
function write16(view:DataView,offset:number,value:number){view.setUint16(offset,value,true);}function write32(view:DataView,offset:number,value:number){view.setUint32(offset,value>>>0,true);}
function concat(parts:Uint8Array[]){const output=new Uint8Array(parts.reduce((sum,part)=>sum+part.length,0));let offset=0;for(const part of parts){output.set(part,offset);offset+=part.length;}return output;}

export function createStoredZip(files:ZipFile[]){
  const localParts:Uint8Array[]=[];const centralParts:Uint8Array[]=[];let localOffset=0;
  for(const file of files){const name=encoder.encode(file.name.replace(/\\/g,"/"));const data=typeof file.data==="string"?encoder.encode(file.data):file.data;const crc=crc32(data);const stamp=dosDateTime(file.modifiedAt??new Date());const local=new Uint8Array(30+name.length);const localView=new DataView(local.buffer);write32(localView,0,0x04034b50);write16(localView,4,20);write16(localView,6,0x0800);write16(localView,8,0);write16(localView,10,stamp.time);write16(localView,12,stamp.date);write32(localView,14,crc);write32(localView,18,data.length);write32(localView,22,data.length);write16(localView,26,name.length);local.set(name,30);localParts.push(local,data);
    const central=new Uint8Array(46+name.length);const centralView=new DataView(central.buffer);write32(centralView,0,0x02014b50);write16(centralView,4,20);write16(centralView,6,20);write16(centralView,8,0x0800);write16(centralView,10,0);write16(centralView,12,stamp.time);write16(centralView,14,stamp.date);write32(centralView,16,crc);write32(centralView,20,data.length);write32(centralView,24,data.length);write16(centralView,28,name.length);write32(centralView,42,localOffset);central.set(name,46);centralParts.push(central);localOffset+=local.length+data.length;
  }
  const centralSize=centralParts.reduce((sum,part)=>sum+part.length,0);const end=new Uint8Array(22);const endView=new DataView(end.buffer);write32(endView,0,0x06054b50);write16(endView,8,files.length);write16(endView,10,files.length);write32(endView,12,centralSize);write32(endView,16,localOffset);return concat([...localParts,...centralParts,end]);
}

export function safeArchiveSegment(value:string,fallback="untitled"){return value.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g,"-").replace(/\s+/g," ").replace(/^\.+|\.+$/g,"").slice(0,80)||fallback;}
