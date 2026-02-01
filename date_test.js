
const dates = [
    "+030388-04-11",
    "+030982-07-08",
    "2022-06-06"
];

dates.forEach(d => {
    const obj = new Date(d);
    console.log(`'${d}' -> Year: ${obj.getFullYear()}`);
});
