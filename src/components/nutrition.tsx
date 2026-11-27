'use client';
import { coachBrandStyle } from '@/lib/brand-theme';
import { menuApplies, parseWeekdays } from '@/lib/meal-schedule';
import { useRef, useState } from 'react';
import {
  CalendarDays,
  Check,
  Camera,
  ChefHat,
  ChevronRight,
  Copy,
  Droplets,
  Leaf,
  PenLine,
  Plus,
  Search,
  Trash2,
  Utensils,
  X,
} from 'lucide-react';
import type { Food } from '@prisma/client';
import type { FoodWithUnits, PlanItem } from '@/lib/types';
import { FoodPicker } from './food-picker';
import { MealPhotoModal } from './meal-photo';
import { NutritionActivity } from './nutrition-activity';
import { AmountInput, defaultAmount, useAmountLabel, type Amount } from './amount-input';
import { DatePicker, Empty, Form, Modal, PageHeading, Submit, useNutri } from './workspace';
export function NutritionView() {
  const { state, library, lang, t, date, run, navigate, number } = useNutri(),
    [modal, setModal] = useState<
      'food' | 'custom' | 'quick' | 'target' | 'proteinTarget' | 'photo' | null
    >(null),
    [meal, setMeal] = useState('breakfast'),
    [selected, setSelected] = useState<FoodWithUnits | null>(null),
    [amount, setAmount] = useState<Amount>(defaultAmount());
  const grams = amount.grams;
  const amountLabel = useAmountLabel();
  const totals = state.meals.reduce(
    (a, m) => {
      for (const key of ['calories', 'protein', 'carbs', 'fat', 'fiber'] as const)
        a[key] += (m.food[key] * m.grams) / 100;
      return a;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );
  const foodName = (f: Pick<Food, 'nameHe' | 'nameEn'>) => (lang === 'he' ? f.nameHe : f.nameEn);
  // Foods of the active plans for this day, shown inside each meal card to tick off.
  const plannedItems =
    state.user.role === 'COACH'
      ? []
      : state.mealPlans
          .filter((plan) => plan.active && menuApplies(plan, date))
          .flatMap((plan) => plan.items);
  const plannedIds = new Set(plannedItems.map((item) => item.id));
  const plannedKcalTotal = Math.round(sumMacros(plannedItems).calories);
  const target = state.profile?.calorieTarget ?? null;
  const over = target !== null && totals.calories > target;
  const plannedProteinTotal = Math.round(sumMacros(plannedItems).protein);
  // A target set by hand wins; otherwise the active plan for the day defines it.
  const ownProteinTarget = state.profile?.proteinTarget ?? null;
  const proteinTarget = ownProteinTarget ?? (plannedProteinTotal > 0 ? plannedProteinTotal : null);
  const proteinFromPlan = ownProteinTarget === null && proteinTarget !== null;
  const proteinOver = proteinTarget !== null && totals.protein > proteinTarget;
  /** Protein, carbs and fat of one portion, e.g. "Protein 12 g · Carbs 30 g · Fat 5 g". */
  const macroLine = (food: MacroFood, grams: number) =>
    (['protein', 'carbs', 'fat'] as const)
      .map((k) => `${t(k)} ${number(Math.round((food[k] * grams) / 10) / 10)} ${t('grams')}`)
      .join(' · ');
  // Optimistic ticks so a tap shows immediately, before the refresh lands.
  const [pendingEat, setPendingEat] = useState<Record<string, boolean>>({});
  const pendingMeals = useRef(new Set<string>());
  const isEaten = (itemId: string) =>
    pendingEat[`${date}:${itemId}`] ?? state.meals.some((m) => m.planItemId === itemId);
  function eat(itemId: string, eaten: boolean) {
    const key = `${date}:${itemId}`;
    if (pendingMeals.current.has(key)) return;
    pendingMeals.current.add(key);
    setPendingEat((all) => ({ ...all, [key]: eaten }));
    run('meal-plans/eat', { itemId, date, eaten }, true)
      .catch(() => {})
      .finally(() => {
        pendingMeals.current.delete(key);
        setPendingEat((all) => {
          const rest = { ...all };
          delete rest[key];
          return rest;
        });
      });
  }
  function add(m: string) {
    setMeal(m);
    setSelected(null);
    setModal('food');
  }
  function manual(m: string) {
    setMeal(m);
    setModal('quick');
  }
  function scan(m: string) {
    setMeal(m);
    setModal('photo');
  }
  const photoReady =
    state.entitlements.ai && state.integrations.photo && state.user.role !== 'COACH';
  return (
    <>
      <PageHeading title={t('diary')} subtitle={t('diarySub')}>
        <DatePicker />
        <button className="button secondary" onClick={() => manual('breakfast')}>
          <PenLine size={16} />
          {t('manualEntry')}
        </button>
        <button className="button primary" onClick={() => add('breakfast')}>
          <Plus size={17} />
          {t('addFood')}
        </button>
      </PageHeading>
      <NutritionActivity />
      <div className="nutrition-stats">
        <button
          type="button"
          className={`panel energy-card ${over ? 'over' : ''}`}
          onClick={() => setModal('target')}
          aria-label={t(target ? 'calorieTarget' : 'setCalorieTarget')}
        >
          <span className="tile-icon peach">
            <Leaf size={20} />
          </span>
          <div className="grow">
            <small>{t('energy')}</small>
            <strong>
              {number(Math.round(totals.calories))}
              {target !== null && <span>/ {number(target)}</span>}
              <span>{t('kcal')}</span>
            </strong>
            {target !== null ? (
              <>
                <div className="calorie-bar" aria-hidden>
                  <span style={{ width: `${Math.min(100, (totals.calories / target) * 100)}%` }} />
                </div>
                <small className="calorie-status">
                  {over
                    ? `${t('caloriesOver')} ${number(Math.round(totals.calories - target))} ${t('kcal')}`
                    : `${t('caloriesLeft')} ${number(Math.round(target - totals.calories))} ${t('kcal')}`}
                </small>
              </>
            ) : (
              <small className="calorie-status link">{t('setCalorieTarget')}</small>
            )}
          </div>
        </button>
        <button
          type="button"
          className={`panel macro-stat target-stat ${proteinOver ? 'over' : ''}`}
          onClick={() => setModal('proteinTarget')}
          aria-label={t(proteinTarget ? 'proteinTarget' : 'setProteinTarget')}
        >
          <span className="dot macro-0" />
          <small>
            {t('protein')}
            {proteinFromPlan && ` · ${t('fromPlan')}`}
          </small>
          <strong>
            {number(Math.round(totals.protein))}
            {proteinTarget !== null && <span>/ {number(proteinTarget)}</span>}
            <span>{t('grams')}</span>
          </strong>
          {proteinTarget !== null ? (
            <>
              <div className="calorie-bar" aria-hidden>
                <span
                  style={{ width: `${Math.min(100, (totals.protein / proteinTarget) * 100)}%` }}
                />
              </div>
              <small className="calorie-status">
                {proteinOver
                  ? `${t('caloriesOver')} ${number(Math.round(totals.protein - proteinTarget))} ${t('grams')}`
                  : `${t('caloriesLeft')} ${number(Math.round(proteinTarget - totals.protein))} ${t('grams')}`}
              </small>
            </>
          ) : (
            <small className="calorie-status link">{t('setProteinTarget')}</small>
          )}
        </button>
        {(['carbs', 'fat', 'fiber'] as const).map((key, i) => (
          <div className="panel macro-stat" key={key}>
            <span className={`dot macro-${(i + 1) % 3}`} />
            <small>{t(key)}</small>
            <strong>
              {number(Math.round(totals[key]))}
              <span>{t('grams')}</span>
            </strong>
          </div>
        ))}
      </div>
      <TodayMenu />
      <div className="toolbar">
        <div className="row wrap">
          <button
            className="button secondary"
            onClick={() => {
              const previous = new Date(`${date}T12:00:00`);
              previous.setDate(previous.getDate() - 1);
              run('meals/copy', {
                from: new Intl.DateTimeFormat('en-CA').format(previous),
                to: date,
              }).catch(() => {});
            }}
          >
            <Copy size={15} />
            {t('copyYesterday')}
          </button>
          <button className="button secondary" onClick={() => navigate('recipes')}>
            <ChefHat size={16} />
            {t('recipes')}
          </button>
          <button className="button secondary" onClick={() => setModal('custom')}>
            <Plus size={15} />
            {t('customFood')}
          </button>
        </div>
        {photoReady ? (
          <button className="button secondary" onClick={() => scan('breakfast')}>
            <Camera size={16} />
            {t('scanMeal')}
          </button>
        ) : (
          state.entitlements.ai && (
            <span className="badge neutral">
              <Camera size={14} />
              {t('notConfigured')}
            </span>
          )
        )}
      </div>
      <div className="diary-layout">
        <div className="meal-list">
          {['breakfast', 'lunch', 'dinner', 'snack'].map((key, index) => {
            const planned = plannedItems.filter((item) => item.meal === key);
            // Entries ticked from the plan are shown on their plan row, not twice.
            const rows = state.meals.filter(
              (m) => m.meal === key && !(m.planItemId && plannedIds.has(m.planItemId)),
            );
            const eatenKcal = state.meals
              .filter((m) => m.meal === key)
              .reduce((n, m) => n + (m.food.calories * m.grams) / 100, 0);
            const plannedKcal = sumMacros(planned).calories;
            const eatenProtein = state.meals
              .filter((m) => m.meal === key)
              .reduce((n, m) => n + (m.food.protein * m.grams) / 100, 0);
            const plannedProtein = sumMacros(planned).protein;
            return (
              <section className="panel meal-card" key={key}>
                <div className="section-heading">
                  <div className="row">
                    <span className={`meal-number meal-${index}`}>
                      {['☀', '◒', '☾', '✦'][index]}
                    </span>
                    <div>
                      <h2>{t(key)}</h2>
                      <small className="muted">
                        {number(Math.round(eatenKcal))}
                        {planned.length > 0 && ` / ${number(Math.round(plannedKcal))}`} {t('kcal')}
                        {' · '}
                        {t('protein')} {number(Math.round(eatenProtein))}
                        {planned.length > 0 && ` / ${number(Math.round(plannedProtein))}`}{' '}
                        {t('grams')}
                      </small>
                    </div>
                  </div>
                  <button
                    className="round-button"
                    onClick={() => add(key)}
                    aria-label={`${t('addFood')} · ${t(key)}`}
                  >
                    <Plus size={18} />
                  </button>
                </div>
                {planned.length > 0 || rows.length > 0 ? (
                  <div>
                    {planned.map((item) => {
                      const eaten = isEaten(item.id);
                      return (
                        <div className={`food-row plan-row ${eaten ? 'eaten' : ''}`} key={item.id}>
                          <button
                            type="button"
                            className="meal-check"
                            role="checkbox"
                            aria-checked={eaten}
                            disabled={pendingEat[`${date}:${item.id}`] !== undefined}
                            aria-label={`${t('markEaten')} · ${foodName(item.food)}`}
                            onClick={() => eat(item.id, !eaten)}
                          >
                            <Check size={16} />
                          </button>
                          <div className="grow">
                            <strong>{foodName(item.food)}</strong>
                            <small>{amountLabel(item)}</small>
                            <small className="food-macros">
                              {macroLine(item.food, item.grams)}
                            </small>
                          </div>
                          <div className="food-numbers">
                            <strong>
                              {number(Math.round((item.food.calories * item.grams) / 100))}
                            </strong>
                            <small>{t('kcal')}</small>
                          </div>
                        </div>
                      );
                    })}
                    {rows.map((m) => (
                      <div className="food-row" key={m.id}>
                        <span className="food-icon">
                          <Leaf size={17} />
                        </span>
                        <div className="grow">
                          <strong>{foodName(m.food)}</strong>
                          <small>{amountLabel(m)}</small>
                          <small className="food-macros">{macroLine(m.food, m.grams)}</small>
                        </div>
                        <div className="food-numbers">
                          <strong>{number(Math.round((m.food.calories * m.grams) / 100))}</strong>
                          <small>{t('kcal')}</small>
                        </div>
                        <button
                          className="icon-btn"
                          aria-label={t('remove')}
                          onClick={() => run('meals/delete', { id: m.id }, true).catch(() => {})}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                    <div className="meal-add-actions">
                      <button type="button" className="manual" onClick={() => manual(key)}>
                        <PenLine size={16} />
                        {t('manualEntry')}
                      </button>
                      <button type="button" onClick={() => add(key)}>
                        <Search size={16} />
                        {t('searchFood')}
                      </button>
                      {photoReady && (
                        <button type="button" onClick={() => scan(key)}>
                          <Camera size={16} />
                          {t('scanMeal')}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="empty-meal">{t('emptyMeal')}</p>
                    <div className="meal-add-actions">
                      <button type="button" className="manual" onClick={() => manual(key)}>
                        <PenLine size={16} />
                        {t('manualEntry')}
                      </button>
                      <button type="button" onClick={() => add(key)}>
                        <Search size={16} />
                        {t('searchFood')}
                      </button>
                      {photoReady && (
                        <button type="button" onClick={() => scan(key)}>
                          <Camera size={16} />
                          {t('scanMeal')}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </section>
            );
          })}
        </div>
        <aside>
          <section className="panel water-card">
            <div className="row">
              <Droplets size={22} />
              <h2>{t('water')}</h2>
            </div>
            <div className="water-total">
              {number(state.water.reduce((n, w) => n + w.ml, 0) / 1000)}
              <small>{t('liters')}</small>
            </div>
            <div className="water-wave" />
            <p>{t('waterHint')}</p>
            <button
              className="button water-button full"
              onClick={() => run('water', { ml: 250, date }, true).catch(() => {})}
            >
              <Plus size={16} />
              {t('addWater')}
            </button>
          </section>
        </aside>
      </div>
      {modal === 'food' && (
        <Modal title={t('addFood')} onClose={() => setModal(null)}>
          {selected ? (
            <Form
              onSubmit={async () => {
                await run('meals/add', { foodId: selected.id, ...amount, meal, date });
                setModal(null);
                setSelected(null);
              }}
            >
              <button type="button" className="text-button" onClick={() => setSelected(null)}>
                <span aria-hidden="true">{lang === 'he' ? '→' : '←'}</span> {t('backButton')}
              </button>
              <h3>{foodName(selected)}</h3>
              <p className="muted small-copy">{t('estimates')}</p>
              <div className="form-grid">
                <label>
                  {t('quantity')}
                  <AmountInput units={selected.units} value={amount} onChange={setAmount} />
                </label>
                <label>
                  {t('meal')}
                  <select value={meal} onChange={(e) => setMeal(e.target.value)}>
                    {['breakfast', 'lunch', 'dinner', 'snack'].map((k) => (
                      <option value={k} key={k}>
                        {t(k)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="portion-preview">
                {(['calories', 'protein', 'carbs', 'fat'] as const).map((k) => (
                  <div key={k}>
                    <small>{t(k === 'calories' ? 'energy' : k)}</small>
                    <strong>
                      {number(Math.round((selected[k] * grams) / 100))}{' '}
                      <small>{t(k === 'calories' ? 'kcal' : 'grams')}</small>
                    </strong>
                  </div>
                ))}
              </div>
              <Submit>{t('log')}</Submit>
            </Form>
          ) : (
            <>
              <button
                type="button"
                className="button secondary full"
                onClick={() => setModal('quick')}
              >
                <PenLine size={16} />
                {t('quickAdd')}
              </button>
              <p className="muted small-copy">{t('orSearchFood')}</p>
              <FoodPicker
                onPick={(f) => {
                  setSelected(f);
                  setAmount(defaultAmount(f.units));
                }}
              />
            </>
          )}
        </Modal>
      )}
      {modal === 'photo' && <MealPhotoModal initialMeal={meal} onClose={() => setModal(null)} />}
      {modal === 'quick' && (
        <Modal title={t('quickAdd')} onClose={() => setModal(null)}>
          <Form
            onSubmit={async (f) => {
              await run('meals/quick', {
                name: f.get('name'),
                calories: Number(f.get('calories')),
                protein: Number(f.get('protein') || 0),
                carbs: Number(f.get('carbs') || 0),
                fat: Number(f.get('fat') || 0),
                meal: f.get('meal'),
                date,
              });
              setModal(null);
            }}
          >
            <label>
              {t('name')}
              <input name="name" maxLength={200} required autoFocus />
            </label>
            <div className="form-grid">
              <label>
                {t('energy')} ({t('kcal')})
                <input type="number" name="calories" min={0} max={10000} step={1} required />
              </label>
              <label>
                {t('meal')}
                <select name="meal" defaultValue={meal}>
                  {['breakfast', 'lunch', 'dinner', 'snack'].map((k) => (
                    <option value={k} key={k}>
                      {t(k)}
                    </option>
                  ))}
                </select>
              </label>
              {(['protein', 'carbs', 'fat'] as const).map((k) => (
                <label key={k}>
                  {t(k)} ({t('grams')})
                  <input type="number" name={k} min={0} max={1000} step={0.1} />
                </label>
              ))}
            </div>
            <Submit>{t('log')}</Submit>
          </Form>
        </Modal>
      )}
      {modal === 'target' && (
        <TargetModal
          field="calorieTarget"
          path="profile/calorie-target"
          unit={t('kcal')}
          min={500}
          max={10000}
          step={10}
          current={target}
          planTotal={plannedKcalTotal}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'proteinTarget' && (
        <TargetModal
          field="proteinTarget"
          path="profile/protein-target"
          unit={t('grams')}
          min={10}
          max={500}
          step={1}
          current={ownProteinTarget}
          planTotal={plannedProteinTotal}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'custom' && (
        <Modal title={t('customFood')} onClose={() => setModal(null)}>
          <Form
            onSubmit={async (f) => {
              await run('foods', {
                nameEn: f.get('nameEn'),
                nameHe: f.get('nameHe'),
                calories: Number(f.get('calories')),
                protein: Number(f.get('protein')),
                carbs: Number(f.get('carbs')),
                fat: Number(f.get('fat')),
                fiber: Number(f.get('fiber')),
              });
              setModal(null);
            }}
          >
            <p className="muted">{t('estimates')}</p>
            <div className="form-grid">
              <label>
                {t('englishName')}
                <input name="nameEn" maxLength={200} required />
              </label>
              <label>
                {t('hebrewName')}
                <input name="nameHe" maxLength={200} required dir="rtl" />
              </label>
              {['calories', 'protein', 'carbs', 'fat', 'fiber'].map((k) => (
                <label key={k}>
                  {t(k === 'calories' ? 'energy' : k)}
                  <input
                    type="number"
                    name={k}
                    min={0}
                    max={k === 'calories' ? 950 : 100}
                    step={0.1}
                    defaultValue={0}
                    required
                  />
                </label>
              ))}
            </div>
            <Submit />
          </Form>
        </Modal>
      )}
    </>
  );
}
export function RecipesView() {
  const { state, library, lang, t, run, number } = useNutri(),
    [open, setOpen] = useState(false),
    [ingredients, setIngredients] = useState<{ foodId: string; grams: number }[]>([]);
  return (
    <>
      <PageHeading title={t('recipes')} subtitle={t('recipeSub')}>
        <button
          className="button primary"
          onClick={() => {
            setIngredients([]);
            setOpen(true);
          }}
        >
          <Plus size={16} />
          {t('newRecipe')}
        </button>
      </PageHeading>
      <div className="program-grid">
        {state.recipes.map((recipe) => {
          const totals =
            recipe.ingredients.reduce((n, i) => n + (i.food.calories * i.grams) / 100, 0) /
            recipe.servings;
          return (
            <article key={recipe.id} className="panel recipe-card">
              <div className="recipe-art">
                <ChefHat size={48} />
              </div>
              <span className="eyebrow">
                {recipe.servings} {t('servings')}
              </span>
              <h2>{recipe.name}</h2>
              <p className="pre-wrap">{recipe.instructions}</p>
              <div className="record-list">
                {recipe.ingredients.map((i) => (
                  <div key={i.id} className="row between">
                    <span>{lang === 'he' ? i.food.nameHe : i.food.nameEn}</span>
                    <small>
                      {number(i.grams)} {t('grams')}
                    </small>
                  </div>
                ))}
              </div>
              <span className="badge">
                {number(Math.round(totals))} {t('kcal')} / {t('servings')}
              </span>
            </article>
          );
        })}
      </div>
      {!state.recipes.length && <Empty text={t('noRecipesYet')} />}{' '}
      {open && (
        <Modal title={t('newRecipe')} onClose={() => setOpen(false)}>
          <Form
            onSubmit={async (f) => {
              await run('recipes', {
                name: f.get('name'),
                instructions: f.get('instructions'),
                servings: Number(f.get('servings')),
                ingredients,
              });
              setOpen(false);
            }}
          >
            <label>
              {t('name')}
              <input name="name" maxLength={200} required />
            </label>
            <label>
              {t('servings')}
              <input type="number" name="servings" defaultValue={2} min={1} max={50} required />
            </label>
            <label>
              {t('recipeInstructions')}
              <textarea name="instructions" maxLength={4000} />
            </label>
            <h3>{t('ingredients')}</h3>
            {ingredients.map((ingredient, index) => (
              <div className="ingredient-row" key={index}>
                <select
                  value={ingredient.foodId}
                  aria-label={t('ingredients')}
                  onChange={(e) =>
                    setIngredients(
                      ingredients.map((row, i) =>
                        i === index ? { ...row, foodId: e.target.value } : row,
                      ),
                    )
                  }
                >
                  {library.foods.map((f) => (
                    <option key={f.id} value={f.id}>
                      {lang === 'he' ? f.nameHe : f.nameEn}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  aria-label={t('portion')}
                  min={1}
                  max={10000}
                  value={ingredient.grams}
                  onChange={(e) =>
                    setIngredients(
                      ingredients.map((row, i) =>
                        i === index ? { ...row, grams: Number(e.target.value) } : row,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t('remove')}
                  onClick={() => setIngredients(ingredients.filter((_, i) => i !== index))}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            <div className="form-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() =>
                  setIngredients([
                    ...ingredients,
                    { foodId: library.foods[0]?.id || '', grams: 100 },
                  ])
                }
              >
                <Plus size={16} />
                {t('addIngredient')}
              </button>
              <Submit />
            </div>
          </Form>
        </Modal>
      )}
    </>
  );
}
export function MealPlansView() {
  const { state, lang, t, run, formatDate } = useNutri();
  // Relationships include revoked and pending ones; only active trainees can receive a plan.
  const activeClients = state.relationships.filter(
    (r) => r.coachId === state.user.id && r.status === 'ACTIVE',
  );
  const activeClientName = (clientId: string) =>
    activeClients.find((r) => r.clientId === clientId)?.client.name;
  const weekdayName = (day: number, weekday: 'long' | 'short' = 'long') =>
    new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en', {
      weekday,
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(2024, 0, 7 + day)));
  const weekOrder = lang === 'he' ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0];
  const scheduleLabel = (p: { menuDate: string | null; menuWeekdays: string | null }) => {
    if (p.menuDate) return `${t('specificDate')} · ${formatDate(p.menuDate + 'T12:00:00Z')}`;
    const picked = parseWeekdays(p.menuWeekdays);
    if (!picked) return t('entireWeek');
    return weekOrder
      .filter((d) => picked.includes(d))
      .map((d) => weekdayName(d, picked.length > 2 ? 'short' : 'long'))
      .join(' · ');
  };
  const [schedule, setSchedule] = useState<'week' | 'days' | 'date'>('week');
  const [days, setDays] = useState<number[]>([]);
  const [items, setItems] = useState<PlanItemDraft[]>([]);
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null);
  const [editor, setEditor] = useState<{
    name?: string;
    content?: string;
    id?: string;
    assignedClientId?: string | null;
    menuDate?: string | null;
    menuWeekdays?: string | null;
    items?: PlanItemDraft[];
  } | null>(null);
  function openEditor(plan: NonNullable<typeof editor>) {
    const picked = parseWeekdays(plan.menuWeekdays);
    setItems(
      (plan.items ?? []).map(({ foodId, grams, quantity, unitHe, unitEn, meal, food }) => ({
        foodId,
        grams,
        quantity,
        unitHe,
        unitEn,
        meal,
        food,
      })),
    );
    setSchedule(plan.menuDate ? 'date' : picked ? 'days' : 'week');
    setDays(picked ?? []);
    setEditor(plan);
  }
  return (
    <>
      <PageHeading
        title={t('mealPlans')}
        subtitle={t(state.user.role === 'COACH' ? 'coachMenusSub' : 'nutritionPlanSub')}
      >
        <button className="button primary" onClick={() => openEditor({})}>
          <Plus size={16} />
          {t('newMealPlan')}
        </button>
      </PageHeading>
      <div className="program-grid">
        {state.mealPlans.map((p) => (
          <article key={p.id} className="panel" style={coachBrandStyle(state, p.userId)}>
            <span className="tile-icon">
              <Utensils size={20} />
            </span>
            <h2>{p.name}</h2>
            <p className="plan-schedule">
              <CalendarDays size={14} />
              {scheduleLabel(p)}
            </p>
            {isEater(p, state.user) && (
              <button
                type="button"
                role="switch"
                aria-checked={p.active}
                className={`plan-active-toggle ${p.active ? 'on' : ''}`}
                onClick={() =>
                  run('meal-plans/active', { id: p.id, active: !p.active }, true).catch(() => {})
                }
              >
                <span className="switch-track" aria-hidden />
                {t(p.active ? 'activeInDiary' : 'inactivePlan')}
              </button>
            )}
            {p.items.length > 0 && <PlanFoods items={p.items} />}
            {p.content && <p className="pre-wrap">{p.content}</p>}
            {p.assignedClientId !== state.user.id && (
              <span className="badge neutral">
                {/* Only an active trainee receives the plan. One assigned to a former trainee
                    (revoked or ended) reaches no one, so it reads as a template. */}
                {(p.assignedClientId && activeClientName(p.assignedClientId)) || t('mealTemplate')}
              </span>
            )}
            {p.userId === state.user.id && (
              <div className="row wrap">
                {state.user.role === 'COACH' && activeClients.length > 0 && (
                  <button className="button primary" onClick={() => openEditor(p)}>
                    {t('assignTo')}
                  </button>
                )}
                <button className="button secondary" onClick={() => openEditor(p)}>
                  {t('edit')}
                </button>
                <button
                  className="button secondary"
                  onClick={() =>
                    openEditor({
                      name: p.name,
                      content: p.content,
                      menuDate: p.menuDate,
                      menuWeekdays: p.menuWeekdays,
                      items: p.items,
                    })
                  }
                >
                  {t('duplicate')}
                </button>
                <button
                  className="icon-btn"
                  aria-label={t('remove')}
                  title={t('remove')}
                  onClick={() => setConfirm({ id: p.id, name: p.name })}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      {!state.mealPlans.length && <Empty text={t('noMealPlansYet')} />}{' '}
      {confirm && (
        <Modal title={t('remove')} role="alertdialog" onClose={() => setConfirm(null)}>
          <p className="confirm-subject">{confirm.name}</p>
          <div className="form-actions">
            <button type="button" className="button secondary" onClick={() => setConfirm(null)}>
              {t('cancel')}
            </button>
            <button
              type="button"
              className="button danger"
              onClick={async () => {
                try {
                  await run('meal-plans/delete', { id: confirm.id });
                  setConfirm(null);
                } catch {}
              }}
            >
              <Trash2 size={16} aria-hidden="true" />
              {t('remove')}
            </button>
          </div>
        </Modal>
      )}
      {editor && (
        <Modal
          title={t(editor.id ? 'edit' : 'newMealPlan')}
          onClose={() => setEditor(null)}
          className="wide-modal"
        >
          <Form
            onSubmit={async (f) => {
              const content = String(f.get('content') ?? '').trim();
              if (!content && !items.length) throw new Error('planEmpty');
              await run('meal-plans', {
                id: editor.id,
                name: f.get('name'),
                content,
                items: items.map(({ foodId, grams, quantity, unitHe, unitEn, meal }) => ({
                  foodId,
                  grams,
                  quantity,
                  unitHe,
                  unitEn,
                  meal,
                })),
                menuDate: schedule === 'date' ? f.get('menuDate') || null : null,
                menuWeekdays: schedule === 'days' ? days : null,
                assignedClientId: f.get('assignedClientId') || null,
              });
              setEditor(null);
            }}
          >
            <label>
              {t('name')}
              <input name="name" defaultValue={editor.name} maxLength={200} required />
            </label>
            <fieldset className="schedule-field">
              <legend>{t('menuSchedule')}</legend>
              <div className="segmented" role="radiogroup" aria-label={t('menuSchedule')}>
                {(['week', 'days', 'date'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={schedule === mode}
                    className={schedule === mode ? 'active' : ''}
                    onClick={() => setSchedule(mode)}
                  >
                    {t(
                      mode === 'week'
                        ? 'entireWeek'
                        : mode === 'days'
                          ? 'chooseDays'
                          : 'specificDate',
                    )}
                  </button>
                ))}
              </div>
              {schedule === 'week' && <p className="muted small-copy">{t('entireWeekHint')}</p>}
              {schedule === 'days' && (
                <>
                  <div className="weekday-chips" role="group" aria-label={t('chooseDays')}>
                    {weekOrder.map((day) => (
                      <button
                        key={day}
                        type="button"
                        data-day={day}
                        aria-pressed={days.includes(day)}
                        aria-label={weekdayName(day)}
                        className={days.includes(day) ? 'active' : ''}
                        onClick={() =>
                          setDays((current) =>
                            current.includes(day)
                              ? current.filter((d) => d !== day)
                              : [...current, day],
                          )
                        }
                      >
                        {weekdayName(day, 'short')}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setDays(days.length === 7 ? [] : [0, 1, 2, 3, 4, 5, 6])}
                  >
                    {t(days.length === 7 ? 'clearDays' : 'selectAllDays')}
                  </button>
                  {!days.length && <p className="muted small-copy">{t('pickDaysHint')}</p>}
                </>
              )}
              {schedule === 'date' && (
                <input
                  type="date"
                  name="menuDate"
                  required
                  aria-label={t('specificDate')}
                  defaultValue={editor.menuDate ?? ''}
                />
              )}
            </fieldset>
            <PlanItemsEditor items={items} setItems={setItems} />
            <label>
              {t('planNotes')}
              <textarea
                name="content"
                rows={3}
                defaultValue={editor.content}
                maxLength={10000}
                placeholder={t('planNotesHint')}
              />
            </label>
            {state.user.role === 'COACH' && (
              <label>
                {t('assignTo')}
                <select name="assignedClientId" defaultValue={editor.assignedClientId ?? ''}>
                  <option value="">{t('mealTemplate')}</option>
                  {activeClients.map((r) => (
                    <option key={r.id} value={r.clientId}>
                      {r.client.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Submit />
          </Form>
        </Modal>
      )}
    </>
  );
}

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
/** Sets or clears a daily target (calories or protein) shown on the diary. */
function TargetModal({
  field,
  path,
  unit,
  min,
  max,
  step,
  current,
  planTotal,
  onClose,
}: {
  field: 'calorieTarget' | 'proteinTarget';
  path: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  current: number | null;
  planTotal: number;
  onClose: () => void;
}) {
  const { t, run, number } = useNutri();
  return (
    <Modal title={t(field)} onClose={onClose}>
      <Form
        onSubmit={async (f) => {
          await run(path, { [field]: Number(f.get(field)) });
          onClose();
        }}
      >
        <label>
          {t(field)} ({unit})
          <input
            type="number"
            name={field}
            min={min}
            max={max}
            step={step}
            required
            autoFocus
            defaultValue={current ?? (planTotal || '')}
          />
        </label>
        <div className="row wrap">
          {planTotal > 0 && (
            <button
              type="button"
              className="button secondary"
              onClick={(event) => {
                const input = event.currentTarget.form?.elements.namedItem(field);
                if (input instanceof HTMLInputElement) input.value = String(planTotal);
              }}
            >
              {t('usePlanTotal')} ({number(planTotal)})
            </button>
          )}
          {current !== null && (
            <button
              type="button"
              className="button secondary"
              onClick={() =>
                run(path, { [field]: null })
                  .then(onClose)
                  .catch(() => {})
              }
            >
              {t('clearTarget')}
            </button>
          )}
        </div>
        <Submit />
      </Form>
    </Modal>
  );
}
type MacroFood = { calories: number; protein: number; carbs: number; fat: number };
type PlanItemDraft = Amount & {
  foodId: string;
  meal: string;
  food: MacroFood & {
    nameEn: string;
    nameHe: string;
    brand: string | null;
    units?: { nameHe: string; nameEn: string; grams: number }[];
  };
};
function sumMacros(items: { grams: number; food: MacroFood }[]) {
  return items.reduce(
    (a, { grams, food }) => ({
      calories: a.calories + (food.calories * grams) / 100,
      protein: a.protein + (food.protein * grams) / 100,
      carbs: a.carbs + (food.carbs * grams) / 100,
      fat: a.fat + (food.fat * grams) / 100,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}
/** Macros of one portion of a food. */
const portion = (food: MacroFood, grams: number) => sumMacros([{ food, grams }]);
/** "420 kcal · Protein 32 g": calories with protein next to them, as shown on plans. */
function useEnergyProtein() {
  const { t, number } = useNutri();
  return (macros: { calories: number; protein: number }) =>
    `${number(Math.round(macros.calories))} ${t('kcal')} · ${t('protein')} ${number(Math.round(macros.protein))} ${t('grams')}`;
}
function MacroTotals({ items }: { items: { grams: number; food: MacroFood }[] }) {
  const { t, number } = useNutri();
  const total = sumMacros(items);
  return (
    <div className="plan-totals">
      <span>
        <strong>{number(Math.round(total.calories))}</strong> {t('kcal')}
      </span>
      {(['protein', 'carbs', 'fat'] as const).map((k) => (
        <span key={k}>
          {t(k)} <strong>{number(Math.round(total[k]))}</strong> {t('grams')}
        </span>
      ))}
    </div>
  );
}
/** Read-only view of a plan's foods, grouped by meal. */
export function PlanFoods({ items, compact = false }: { items: PlanItem[]; compact?: boolean }) {
  const { t, lang } = useNutri();
  const energyProtein = useEnergyProtein();
  const amountLabel = useAmountLabel();
  return (
    <div className={`plan-foods ${compact ? 'compact' : ''}`}>
      {MEALS.map((meal) => {
        const rows = items.filter((i) => i.meal === meal);
        if (!rows.length) return null;
        return (
          <div key={meal} className="plan-meal">
            <span className="plan-meal-title">
              {t(meal)}
              <small>{energyProtein(sumMacros(rows))}</small>
            </span>
            <ul>
              {rows.map((i) => (
                <li key={i.id}>
                  <span>{lang === 'he' ? i.food.nameHe : i.food.nameEn}</span>
                  <small>
                    {amountLabel(i)} · {energyProtein(portion(i.food, i.grams))}
                  </small>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <MacroTotals items={items} />
    </div>
  );
}
function PlanItemsEditor({
  items,
  setItems,
}: {
  items: PlanItemDraft[];
  setItems: React.Dispatch<React.SetStateAction<PlanItemDraft[]>>;
}) {
  const { t, lang } = useNutri();
  const energyProtein = useEnergyProtein();
  const [picking, setPicking] = useState<string | null>(null);
  return (
    <fieldset className="plan-editor">
      <legend>{t('planFoods')}</legend>
      {MEALS.map((meal) => {
        const rows = items
          .map((item, index) => ({ item, index }))
          .filter(({ item }) => item.meal === meal);
        return (
          <div key={meal} className="plan-meal editing">
            <span className="plan-meal-title">
              {t(meal)}
              {rows.length > 0 && (
                <small>{energyProtein(sumMacros(rows.map((r) => r.item)))}</small>
              )}
            </span>
            {rows.map(({ item, index }) => (
              <div className="plan-item-row" key={index}>
                <span className="grow">
                  <strong>{lang === 'he' ? item.food.nameHe : item.food.nameEn}</strong>
                  <small>
                    {item.food.brand ? `${item.food.brand} · ` : ''}
                    {energyProtein(portion(item.food, item.grams))}
                  </small>
                </span>
                <AmountInput
                  compact
                  units={item.food.units}
                  value={item}
                  onChange={(next) =>
                    setItems((all) => all.map((x, i) => (i === index ? { ...x, ...next } : x)))
                  }
                />
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t('remove')}
                  onClick={() => setItems((all) => all.filter((_, i) => i !== index))}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            {picking === meal ? (
              <div className="plan-picker">
                <FoodPicker
                  onPick={(food) => {
                    setItems((all) => [
                      ...all,
                      { foodId: food.id, ...defaultAmount(food.units), meal, food },
                    ]);
                    setPicking(null);
                  }}
                />
                <button type="button" className="text-button" onClick={() => setPicking(null)}>
                  {t('cancel')}
                </button>
              </div>
            ) : (
              <button type="button" className="text-button" onClick={() => setPicking(meal)}>
                <Plus size={14} />
                {t('addFoodToMeal')}
              </button>
            )}
          </div>
        );
      })}
      {items.length > 0 && <MacroTotals items={items} />}
    </fieldset>
  );
}

/** True when the signed-in user is the one who eats from this plan (and so decides if it is active). */
function isEater(
  plan: { userId: string; assignedClientId: string | null },
  user: { id: string; role: string },
) {
  if (user.role === 'COACH') return false;
  return plan.assignedClientId ? plan.assignedClientId === user.id : plan.userId === user.id;
}

/** Which menus are active today, plus their notes; the foods themselves live in the meal cards. */
function TodayMenu() {
  const { state, t, date, run, navigate } = useNutri();
  if (state.user.role === 'COACH') return null;
  const plans = state.mealPlans.filter((plan) => plan.active && menuApplies(plan, date));
  if (!plans.length)
    return state.mealPlans.length ? (
      <section className="panel today-menu empty">
        <Utensils size={18} />
        <span className="grow">{t('noActiveMenu')}</span>
        <button type="button" className="button secondary" onClick={() => navigate('mealPlans')}>
          {t('chooseActiveMenu')}
        </button>
      </section>
    ) : null;
  return (
    <section className="panel today-menu">
      <div className="today-menu-head">
        <Utensils size={18} />
        <span className="grow">
          <span className="eyebrow">{t('todaysMenu')}</span>
          <strong>{plans.map((plan) => plan.name).join(' · ')}</strong>
        </span>
        <button type="button" className="text-button" onClick={() => navigate('mealPlans')}>
          {t('chooseActiveMenu')}
        </button>
      </div>
      {plans
        .filter((plan) => plan.content)
        .map((plan) => (
          <div
            key={plan.id}
            className="today-menu-notes"
            style={coachBrandStyle(state, plan.userId)}
          >
            <p className="pre-wrap">{plan.content}</p>
            {!plan.items.length && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={state.mealChecks.some((c) => c.planId === plan.id && !c.meal)}
                  onChange={(event) =>
                    void run(
                      'meal-plans/check',
                      { planId: plan.id, date, completed: event.target.checked },
                      true,
                    ).catch(() => {})
                  }
                />
                {t('menuCompleted')}
              </label>
            )}
          </div>
        ))}
    </section>
  );
}
