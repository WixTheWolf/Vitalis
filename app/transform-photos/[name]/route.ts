import {NextRequest,NextResponse} from "next/server";
export function GET(req:NextRequest,{params}:{params:Promise<{name:string}>}){return params.then(({name})=>NextResponse.redirect(new URL(`/transform-photos/${name.replace(/\.jpg$/i,".svg")}`,req.url),307))}
