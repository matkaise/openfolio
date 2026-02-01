"use client";

import React, { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Sector } from 'recharts';

interface AllocationItem {
    id: string;
    name: string;
    value: number;
    percentage: number;
    color: string;
    count: number;
}

interface AllocationChartProps {
    data: AllocationItem[];
    centerLabel?: string;
    currency: string;
}

const renderActiveShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, value, percent } = props;

    return (
        <g>
            <Sector
                cx={cx}
                cy={cy}
                innerRadius={innerRadius}
                outerRadius={outerRadius + 6}
                startAngle={startAngle}
                endAngle={endAngle}
                fill={fill}
            />
            <Sector
                cx={cx}
                cy={cy}
                startAngle={startAngle}
                endAngle={endAngle}
                innerRadius={innerRadius - 2}
                outerRadius={outerRadius + 8}
                fill={fill}
                fillOpacity={0.2}
            />
        </g>
    );
};



export const AllocationChart = ({ data, centerLabel, currency }: AllocationChartProps) => {
    const [activeIndex, setActiveIndex] = useState<number | null>(null);

    const onPieEnter = (_: any, index: number) => {
        setActiveIndex(index);
    };

    const onPieLeave = () => {
        setActiveIndex(null);
    };

    const activeItem = activeIndex !== null ? data[activeIndex] : null;

    // Smart font sizing for large numbers
    const getFontSize = (val: number) => {
        const str = val.toLocaleString('de-DE', { maximumFractionDigits: 0 });
        if (str.length > 10) return "text-sm"; // > 10M
        if (str.length > 7) return "text-base"; // > 100k
        return "text-lg";
    };

    return (
        <div className="w-full h-full relative">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <defs>
                        {data.map((entry, index) => (
                            <linearGradient key={`gradient-${index}`} id={`gradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={entry.color} stopOpacity={1} />
                                <stop offset="100%" stopColor={entry.color} stopOpacity={0.6} />
                            </linearGradient>
                        ))}
                    </defs>
                    <Pie
                        // @ts-ignore
                        activeIndex={activeIndex ?? -1}
                        activeShape={renderActiveShape}
                        data={data}
                        cx="50%"
                        cy="50%"
                        innerRadius="60%"
                        outerRadius="80%"
                        paddingAngle={3}
                        dataKey="value"
                        onMouseEnter={onPieEnter}
                        onMouseLeave={onPieLeave}
                        stroke="none"
                    >
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={`url(#gradient-${index})`} stroke={entry.color} strokeWidth={0} />
                        ))}
                    </Pie>
                </PieChart>
            </ResponsiveContainer>

            {/* Dynamic Center Label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-4 text-center">
                {activeItem ? (
                    <div className="animate-in fade-in zoom-in duration-200">
                        <div className="text-xs text-slate-400 font-medium truncate max-w-[120px] mx-auto mb-0.5">{activeItem.name}</div>
                        <div className={`${getFontSize(activeItem.value)} font-bold text-white tracking-tight`}>
                            {activeItem.value.toLocaleString('de-DE', { maximumFractionDigits: 0 })}
                            <span className="text-xs ml-1 font-normal text-slate-400">{currency}</span>
                        </div>
                        <div className="text-[10px] font-bold text-emerald-400 mt-0.5 bg-emerald-500/10 px-2 py-0.5 rounded-full inline-block">
                            {activeItem.percentage.toFixed(1)}%
                        </div>
                    </div>
                ) : (
                    <div className="animate-in fade-in zoom-in duration-200">
                        <span className="text-4xl font-bold text-white tracking-tight drop-shadow-lg">{data.length}</span>
                        <span className="block text-xs text-slate-400 uppercase tracking-wider font-bold mt-1">Klassen</span>
                    </div>
                )}
            </div>
        </div>
    );
};
