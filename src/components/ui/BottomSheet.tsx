import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface BottomSheetProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
}

const BottomSheet: React.FC<BottomSheetProps> = ({ isOpen, onClose, title, children }) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/40 z-[1000] backdrop-blur-[2px]"
                    />
                    <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed bottom-0 left-0 right-0 bg-bg-primary rounded-t-[2.5rem] z-[1001] max-h-[90vh] overflow-y-auto shadow-[0_-8px_30px_rgb(0,0,0,0.12)] max-w-[500px] mx-auto overflow-hidden flex flex-col"
                    >
                        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mt-3 shrink-0" />
                        <div className="p-6 flex justify-between items-center shrink-0">
                            <h2 className="text-[20px] font-bold tracking-tight">{title}</h2>
                            <button
                                onClick={onClose}
                                className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-text-secondary active:scale-90 transition-transform"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="px-6 pb-12 overflow-y-auto">
                            {children}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default BottomSheet;
