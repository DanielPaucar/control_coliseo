"use client";
import { useEffect, useState } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from "recharts";

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((res) => res.json())
      .then((d) => setData(d));
  }, []);

  if (!data) return <p className="p-8">Cargando...</p>;

  const chartData = [
    { name: "Estudiantes", value: data.estudiantes },
    { name: "Familiares", value: data.familiares },
    { name: "Visitantes", value: data.visitantes },
  ];
  const COLORS = ["#3b82f6", "#22c55e", "#f97316"];

  return (
    <main className="min-h-screen bg-gray-100 p-8 text-gray-900">
      <h1 className="text-3xl font-bold mb-6">📊 Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow text-gray-900">
          <h2 className="text-xl font-bold mb-4">Resumen de ingresos</h2>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                outerRadius={100}
                label
              >
                {chartData.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-6 rounded-xl shadow text-gray-900">
          <h2 className="text-xl font-bold mb-4">Últimos 10 ingresos</h2>
          <ul className="space-y-2">
            {data.ultimos.map((i: any) => (
              <li
                key={i.id_ingreso}
                className="border p-2 rounded flex justify-between"
              >
                <span>{i.codigoqr.codigo}</span>
                <span className="text-gray-500 text-sm">
                  {new Date(i.fecha).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
