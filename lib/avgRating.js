module.exports = {
    avgRating: function (ratings) {
        if (!Array.isArray(ratings)) return null;
        
        const sum = ratings.reduce((acc, val) => acc + val, 0);
        const count = ratings.length;

        if (count === 0) return null; // Avoid division by zero

        const mean = parseFloat(sum / count).toFixed(1);

        return isNaN(mean) ? null : Number(mean); 
    }
};