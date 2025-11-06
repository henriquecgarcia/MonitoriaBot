// utils/formatDate.js
export default function formatDate(d) {
	const dt = new Date(d);
	const yyyy = dt.getFullYear();
	const mm = String(dt.getMonth()+1).padStart(2,'0');
	const dd = String(dt.getDate()).padStart(2,'0');
	const hh = String(dt.getHours()).padStart(2,'0');
	const mi = String(dt.getMinutes()).padStart(2,'0');
	const ss = String(dt.getSeconds()).padStart(2,'0');
	return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}
