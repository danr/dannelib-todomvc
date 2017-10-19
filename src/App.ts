import * as Plumbing from './Plumbing'
import * as Snabbdom from "./Snabbdom"
import * as S from "./Snabbdom"
import * as typestyle from "typestyle"

import { style } from "typestyle"
import { tag, Build } from "./Snabbdom"
import { VNode } from "snabbdom/vnode"

import { Ref, record, views, at } from "./Dannelib"

export type Visibility = 'all' | 'complete' | 'incomplete'

const visibilites = ['all', 'complete', 'incomplete'] as Visibility[]

interface Todo {
  id: number,
  text: string,
  completed: boolean
}

export type State = {
  next_id: number,
  todos: Todo[],
  new_input: string,
  visibility: Visibility
}

function visibility_from_hash(hash: string, s: State): State {
  const bare = hash.slice(2)
  if (visibilites.some(x => x == bare)) {
    return {
      ...s,
      visibility: bare as Visibility
    }
  } else {
    return s
  }
}

export const init: State = Plumbing.stored_or({
  next_id: 0,
  todos: [],
  new_input: '',
  visibility: 'all',
})

function new_todo(s: State): State {
  if (s.new_input != '') {
    return {
      ...s,
      next_id: s.next_id + 1,
      new_input: '',
      todos:
        [...s.todos, {
          id: s.next_id,
          text: s.new_input,
          completed: false
        }],
    }
  } else {
    return s
  }
}

const remove_todo =
  (id: number) =>
  (todos: Todo[]) =>
  todos.filter(t => t.id != id)

const CatchSubmit = (cb: () => void, ...bs: Build[]) =>
  tag('form',
    S.on('submit')((e: Event) => {
        cb()
        e.preventDefault()
      }),
    ...bs)

const InputField = (r: Ref<string>, ...bs: Build[]) =>
  tag('input',
    S.attrs({
      type: 'text',
      value: r.get()
    }),
    S.on('input')((e: Event) => r.set((e.target as HTMLInputElement).value)),
    ...bs)

// actually not a checkbox
export const Checkbox =
  (value: boolean, update: (new_value: boolean) => void, ...bs: Build[]) =>
  tag('span',
    S.classes({checked: value}),
    S.on('click')((_: MouseEvent) => update(!value)),
    S.on('input')((_: Event) => update(!value)),
    S.styles({cursor: 'pointer'}),
    ...bs)

const view = (r: Ref<State>) =>
  r.proj$('todos', todos =>
    tag('section .todoapp #todoapp',
      tag('header .header',
        tag('h1', 'todos'),
        CatchSubmit(
          () => r.modify(new_todo),
          InputField(
            r.proj('new_input'),
            S.attrs({
              placeholder: 'What needs to be done?',
              autofocus: true
            }),
            S.classed('new-todo')
          )
        )
      ),
      r.get()['todos'].length == 0 ? null :
      tag('section .main',
        Checkbox(
          todos.get().some(todo => !todo.completed),
          (b: boolean) => todos.modify(
            todos => todos.map(todo => ({...todo, completed: !b}))
          ),
          S.classed('toggle-all'),
          S.id('toggle-all')),
        tag('ul .todo-list',
          views(todos)
            .filter(todo => r.get().visibility != (todo.get().completed ? 'incomplete' : 'complete'))
            .map(todo => {
              const {completed, id, text} = todo.get()
              return tag('li .todo',
                S.classes({ completed }),
                tag('div .view',
                  Checkbox(
                    completed,
                    todo.proj('completed').set,
                    S.classed('toggle'),
                    S.style('height', '40px')),
                  tag('label', text),
                  tag('button .destroy',
                    S.on('click')(_ => todos.modify(remove_todo(id))))
                ),
                InputField(todo.proj('text'), S.classed('edit'))
              )
            })
          )
      ),
      tag('footer .footer',
        tag('span .todo-count', r.proj('todos').get().length.toString()),
        tag('ul .filters',
          visibilites.map((opt: Visibility) =>
            tag('li',
              tag('a',
                S.classes({selected: r.proj('visibility').get() == opt}),
                S.attrs({href: '#/' + opt}),
                opt)
            )
          )
        )
        // todo: clear completed
      )
    )
  )



export const bind =
  Plumbing.bind(
    Plumbing.route(
      visibility_from_hash,
      s => s.visibility,
      view))
