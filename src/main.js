/**
 * Функция для расчета выручки
 * @param purchase запись о покупке (элемент из record.items)
 * @param _product карточка товара (data.products[sku])
 * @returns {number}
 */
function calculateSimpleRevenue(purchase, _product) {
    const { discount = 0, sale_price = 0, quantity = 0 } = purchase || {};
    const discountLeft = 1 - (Number(discount) || 0) / 100; // остаток после скидки
    const qty = Number(quantity) || 0;
    const price = Number(sale_price) || 0;
    return price * qty * discountLeft;
  }
  
  /**
   * Функция для расчета бонусов
   * @param {number} index порядковый номер в отсортированном массиве (0 — лидер)
   * @param {number} total общее число продавцов
   * @param {object} seller карточка продавца со сводной статистикой (как в sellerStats)
   * @returns {number}
   */
  function calculateBonusByProfit(index, total, seller) {
    const profit = Number(seller?.profit) || 0;
    if (index === 0) return +(profit * 0.15).toFixed(2);         // 15% — первому
    if (index === 1 || index === 2) return +(profit * 0.10).toFixed(2); // 10% — 2-3 места
    if (index === total - 1) return 0;                           // 0% — последнему
    return +(profit * 0.05).toFixed(2);                          // 5% — остальным
  }
  
  /**
   * Функция для анализа данных продаж
   * @param {object} data
   * @param {{calculateRevenue: Function, calculateBonus: Function}} options
   * @returns {{revenue:number, top_products:{sku:string, quantity:number}[], bonus:number, name:string, sales_count:number, profit:number, seller_id:string}[]}
   */
  function analyzeSalesData(data, options) {
    // --- Проверка входных данных ---
    if (
      !data
      || !Array.isArray(data.sellers) || data.sellers.length === 0
      || !Array.isArray(data.products) || data.products.length === 0
      || !Array.isArray(data.purchase_records) || data.purchase_records.length === 0
    ) {
      throw new Error('Некорректные входные данные: ожидаются непустые массивы sellers, products, purchase_records');
    }
  
    // --- Проверка наличия опций ---
    const { calculateRevenue, calculateBonus } = options || {};
    if (!calculateRevenue || !calculateBonus) {
      throw new Error('Не переданы функции расчёта: calculateRevenue и/или calculateBonus');
    }
    // (опционально) проверим, что это функции
    if (typeof calculateRevenue !== 'function' || typeof calculateBonus !== 'function') {
      throw new Error('Переданные calculateRevenue и/или calculateBonus не являются функциями');
    }
  
    // --- Подготовка промежуточных данных для сбора статистики ---
    const sellerStats = data.sellers.map((seller) => ({
      id: seller.id,
      name: `${seller.first_name} ${seller.last_name}`,
      revenue: 0,
      profit: 0,
      sales_count: 0,
      products_sold: {},
    }));
  
    // --- Индексация продавцов и товаров для быстрого доступа ---
    const sellerIndex = Object.fromEntries(sellerStats.map(s => [s.id, s]));
    const productIndex = Object.fromEntries((data.products || []).map(p => [p.sku, p]));
  
    // --- Расчет выручки и прибыли для каждого продавца ---
    for (const record of data.purchase_records) {
      const seller = sellerIndex[record.seller_id];
      if (!seller) {
        // Если встретился чек с неизвестным продавцом — просто пропустим (можно и выбросить ошибку, но бережно пропустим)
        // console.warn?.('Чек с неизвестным seller_id:', record.seller_id);
        continue;
      }
  
      seller.sales_count += 1;
  
      // Пройдёмся по позициям, посчитаем по ним выручку (для профита) и себестоимость
      let sumRevenueByItems = 0;
      let sumProfitByItems = 0;
  
      for (const item of record.items || []) {
        const product = productIndex[item.sku];
        const qty = Number(item.quantity) || 0;
        const cost = (product ? Number(product.purchase_price) : 0) * qty;
        const rev = Number(calculateRevenue(item, product)) || 0;
        const itemProfit = rev - cost;
  
        sumRevenueByItems += rev;
        sumProfitByItems += itemProfit;
  
        // Учёт количества проданных товаров
        if (!seller.products_sold[item.sku]) {
          seller.products_sold[item.sku] = 0;
        }
        seller.products_sold[item.sku] += qty;
      }
  
      // В выручку продавца кладём сумму чека, если она есть, иначе — сумму по позициям
      const recordRevenue = Number.isFinite(Number(record.total_amount))
        ? Number(record.total_amount)
        : sumRevenueByItems;
  
      seller.revenue += recordRevenue;
      seller.profit += sumProfitByItems;
    }
  
    // --- Сортировка продавцов по прибыли (по убыванию) ---
    sellerStats.sort((a, b) => b.profit - a.profit);
  
    // --- Назначение премий и формирование топ-10 товаров ---
    sellerStats.forEach((seller, index) => {
      seller.bonus = calculateBonus(index, sellerStats.length, seller);
  
      seller.top_products = Object
        .entries(seller.products_sold) // [[sku, qty], ...]
        .map(([sku, quantity]) => ({ sku, quantity }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 10);
    });
  
    // --- Подготовка итоговой коллекции ---
    return sellerStats.map((seller) => ({
      seller_id: seller.id,
      name: seller.name,
      revenue: +seller.revenue.toFixed(2),
      profit: +seller.profit.toFixed(2),
      sales_count: seller.sales_count,
      top_products: seller.top_products,
      bonus: +Number(seller.bonus || 0).toFixed(2),
    }));
  }