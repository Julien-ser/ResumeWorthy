"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { ResumeBlock } from "@/types/database";
import { ingestResume } from "./actions/shred"; 
import { motion } from "framer-motion"; // For the drag physics

export default function Home() {
  const [blocks, setBlocks] = useState<ResumeBlock[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  
  // Ref for the "soup" container to keep blocks inside
  const constraintsRef = useRef(null);

  const MY_USER_ID = "fe99444d-be7f-421d-8868-28d6142f4a60";

  async function fetchBlocks() {
    const { data, error } = await supabase
      .from("blocks")
      .select("*")
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Error fetching:", error);
    } else {
      setBlocks(data as ResumeBlock[]);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      await ingestResume(formData, MY_USER_ID);
      alert("Resume parsed successfully!");
      fetchBlocks();
    } catch (err) {
      console.error(err);
      alert("Failed to shred resume. Check console.");
    } finally {
      setUploading(false);
    }
  }

  async function addTestBlock() {
    setLoading(true);
    const newBlock: Partial<ResumeBlock> = {
      user_id: MY_USER_ID, 
      type: "experience",
      content: { 
        title: "Founding Engineer", 
        company: "Resumeworthy", 
        description_bullets: ["Building the future of career tech", "Using React Compiler for GOAT performance"] 
      },
      tags: ["Next.js", "TypeScript", "Startup"]
    };

    const { error } = await supabase.from("blocks").insert([newBlock]);
    if (error) alert(error.message);
    else fetchBlocks();
    setLoading(false);
  }

  useEffect(() => { fetchBlocks(); }, []);

  return (
    <main className="p-8 max-w-6xl mx-auto min-h-screen">
      <div className="flex justify-between items-center mb-10">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">Career Library</h1>
        <button 
          onClick={addTestBlock}
          disabled={loading}
          className="bg-black text-white px-6 py-2 rounded-full font-medium hover:bg-gray-800 transition-all disabled:opacity-50"
        >
          {loading ? "Saving..." : "+ Add Manual"}
        </button>
      </div>

      <div className="mb-12 p-8 border-2 border-dashed border-gray-200 rounded-3xl bg-gray-50/50 text-center hover:border-black transition-colors group">
        <div className="max-w-xs mx-auto">
          <p className="mb-4 text-sm font-semibold text-gray-900 uppercase tracking-wider">Fast Track</p>
          <p className="mb-6 text-gray-500 text-sm">Upload your PDF to toss new blocks into the soup.</p>
          <input 
            type="file" 
            accept=".pdf" 
            onChange={handleFileUpload}
            disabled={uploading}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-6 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-black file:text-white hover:file:bg-gray-800 cursor-pointer disabled:opacity-50"
          />
          {uploading && <p className="mt-4 text-sm text-blue-600 font-medium animate-pulse">Shredding PDF...</p>}
        </div>
      </div>

      {/* THE SOUP CONTAINER */}
      <div 
        ref={constraintsRef} 
        className="relative min-h-[700px] w-full border-2 border-slate-100 rounded-[40px] bg-slate-50/30 p-10 overflow-hidden"
      >
        <div className="flex flex-wrap gap-6">
          {blocks.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
               <p className="text-gray-400 italic">Your soup is empty. Upload a PDF to start cooking.</p>
            </div>
          ) : (
            blocks.map((block) => {
              const typeStyles: any = {
                experience: { bg: "bg-emerald-50", border: "border-emerald-100", text: "text-emerald-700", label: "Work" },
                education: { bg: "bg-blue-50", border: "border-blue-100", text: "text-blue-700", label: "Education" },
                skill: { bg: "bg-purple-50", border: "border-purple-100", text: "text-purple-700", label: "Skill" },
                project: { bg: "bg-amber-50", border: "border-amber-100", text: "text-amber-700", label: "Project" },
                summary: { bg: "bg-slate-100", border: "border-slate-200", text: "text-slate-600", label: "Profile" },
              }[block.type] || { bg: "bg-white", border: "border-gray-200", text: "text-gray-600", label: block.type };

              return (
                <motion.div 
                  key={block.id} 
                  drag
                  dragConstraints={constraintsRef}
                  dragTransition={{ bounceStiffness: 500, bounceDamping: 25 }}
                  whileDrag={{ scale: 1.05, rotate: "1deg", zIndex: 50 }}
                  className={`w-[320px] p-6 border rounded-3xl shadow-sm cursor-grab active:cursor-grabbing bg-white ${typeStyles.border} hover:shadow-md transition-shadow`}
                >
                  <div className="pointer-events-none">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded mb-2 inline-block ${typeStyles.bg} ${typeStyles.text}`}>
                          {typeStyles.label}
                        </span>
                        <h3 className="text-lg font-bold text-slate-900 leading-tight">
                          {block.content.title || (block.type === 'skill' ? 'Expertise' : 'Untitled')}
                        </h3>
                        {block.content.company && (
                          <p className="text-slate-500 text-xs font-semibold mt-0.5">{block.content.company}</p>
                        )}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      {block.content.description_bullets?.slice(0, 3).map((bullet, i) => (
                        <p key={i} className="text-slate-600 text-[11px] leading-relaxed flex gap-2">
                          <span className="text-slate-300 flex-shrink-0">•</span>
                          {bullet}
                        </p>
                      ))}
                    </div>

                    {block.tags && block.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-4 pt-3 border-t border-slate-50">
                        {block.tags.slice(0, 4).map(tag => (
                          <span key={tag} className="text-[9px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded">
                            #{tag.toLowerCase().replace(/\s+/g, '')}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}